"""Offline unit tests for the inventory seed safety gate."""

import pytest

from app.inventory_seed import _assert_seed_database_is_approved


def test_seed_requires_explicit_development_opt_in(monkeypatch):
    monkeypatch.delenv("INVENTORY_SEED_ENV", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev-user:dev-pass@project.pooler.supabase.com:6543/postgres")
    with pytest.raises(RuntimeError, match="INVENTORY_SEED_ENV=development"):
        _assert_seed_database_is_approved()


@pytest.mark.parametrize(
    "env_name,env_value",
    [
        ("INVENTORY_SEED_ALLOWED_DATABASE_HOST", "other.pooler.supabase.com"),
        ("INVENTORY_SEED_ALLOWED_DATABASE_USER", "other-user"),
        ("INVENTORY_SEED_ALLOWED_DATABASE_NAME", "other-database"),
    ],
)
def test_seed_requires_exact_isolated_database_allowlist(monkeypatch, env_name, env_value):
    monkeypatch.setenv("INVENTORY_SEED_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev-user:dev-pass@dev-project.pooler.supabase.com:6543/nexova_dev")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_HOST", "dev-project.pooler.supabase.com")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_USER", "dev-user")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_NAME", "nexova_dev")
    monkeypatch.setenv(env_name, env_value)
    with pytest.raises(RuntimeError, match="allowlisted isolated Supabase development"):
        _assert_seed_database_is_approved()


def test_seed_accepts_only_explicit_allowlisted_development_database(monkeypatch):
    monkeypatch.setenv("INVENTORY_SEED_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev-user:dev-pass@dev-project.pooler.supabase.com:6543/nexova_dev")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_HOST", "dev-project.pooler.supabase.com")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_USER", "dev-user")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_NAME", "nexova_dev")
    _assert_seed_database_is_approved()


def _approved_seed_env(monkeypatch):
    monkeypatch.setenv("INVENTORY_SEED_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql://dev-user:dev-pass@dev-project.pooler.supabase.com:6543/nexova_dev")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_HOST", "dev-project.pooler.supabase.com")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_USER", "dev-user")
    monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_NAME", "nexova_dev")


def _register_active_user(path):
    from tinydb import TinyDB

    db = TinyDB(path)
    db.table("users").insert({"email": "temp@example.com", "is_active": True, "user_uuid": "00000000-0000-4000-8000-000000000001"})
    db.close()


def test_temporary_tinydb_user_cannot_own_canonical_seed(monkeypatch, tmp_path):
    from app.inventory_seed import seed_inventory

    path = tmp_path / "ephemeral-users.json"
    _register_active_user(path)
    _approved_seed_env(monkeypatch)
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(path))
    with pytest.raises(RuntimeError, match="temporary"):
        seed_inventory()


def test_canonical_seed_owner_is_not_injectable(monkeypatch, tmp_path):
    """Patching a users-table accessor must not supply the canonical seed owner."""
    import inspect

    from app import inventory_seed

    path = tmp_path / "ephemeral-users.json"
    _register_active_user(path)
    _approved_seed_env(monkeypatch)
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(path))
    monkeypatch.setattr(inventory_seed, "get_users_table", lambda: None, raising=False)
    assert list(inspect.signature(inventory_seed.seed_inventory).parameters) == ["session"]
    with pytest.raises(RuntimeError, match="temporary"):
        inventory_seed.seed_inventory()


def test_canonical_seed_requires_active_persistent_user(monkeypatch, tmp_path):
    from app import inventory_seed

    persistent = tmp_path / "persistent" / "suppliers.json"
    persistent.parent.mkdir()
    monkeypatch.setattr(inventory_seed, "_temporary_roots", lambda: [tmp_path / "elsewhere"])
    _approved_seed_env(monkeypatch)
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(persistent))
    with pytest.raises(RuntimeError, match="Create an authorized TinyDB user"):
        inventory_seed.seed_inventory()


def test_isolated_catalog_seed_is_idempotent_and_attributed(tmp_path):
    from sqlalchemy.pool import StaticPool
    from sqlmodel import Session, SQLModel, create_engine, select

    from app.inventory_models import Asset, AssetEntry, AssetExit
    from app.inventory_seed import CANONICAL_CATALOG, apply_seed_catalog

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        assert apply_seed_catalog(session, CANONICAL_CATALOG, "owner-uuid") == {"assets": 6, "entries": 4, "exits": 3}
        session.commit()
        assert apply_seed_catalog(session, CANONICAL_CATALOG, "other-uuid") == {"assets": 0, "entries": 0, "exits": 0}
        rows = session.exec(select(AssetEntry)).all() + session.exec(select(AssetExit)).all()
        assert {r.user_uuid for r in rows} == {"owner-uuid"}
        it001 = session.exec(select(Asset).where(Asset.sku == "NXV-IT-001")).one()
        per001 = session.exec(select(Asset).where(Asset.sku == "NXV-PER-001")).one()
        stock = lambda a: sum(r.quantity for r in rows if r.asset_id == a.id and isinstance(r, AssetEntry)) - sum(
            r.quantity for r in rows if r.asset_id == a.id and isinstance(r, AssetExit))
        assert (stock(it001), stock(per001)) == (12, 17)


def test_relative_supplier_db_path_is_independent_of_working_directory(monkeypatch, tmp_path):
    from app.database import API_DIR, DEFAULT_DATABASE_PATH, resolve_database_path

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("SUPPLIER_DB_PATH", "./data/suppliers.json")
    assert resolve_database_path() == DEFAULT_DATABASE_PATH.resolve()
    monkeypatch.setenv("SUPPLIER_DB_PATH", "other/users.json")
    assert resolve_database_path() == (API_DIR / "other" / "users.json").resolve()
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(tmp_path / "abs.json"))
    assert resolve_database_path() == tmp_path / "abs.json"
    monkeypatch.delenv("SUPPLIER_DB_PATH")
    assert resolve_database_path() == DEFAULT_DATABASE_PATH
