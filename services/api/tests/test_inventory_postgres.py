"""Opt-in integration tests against an explicitly allowlisted Supabase dev database.

These tests never fall back to SQLite. Configure them only in services/api/.env,
which must remain ignored by Git. They create uniquely named test rows and never
truncate/drop pre-existing tables or data.
"""

from __future__ import annotations

import os
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from dotenv import dotenv_values
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import make_url
from sqlmodel import Session, SQLModel

API_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = API_DIR.parents[1]
ENV_FILE = API_DIR / ".env"


def _configured_values() -> dict[str, str]:
    if not ENV_FILE.is_file():
        pytest.skip("Live PostgreSQL tests blocked: services/api/.env is absent")
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", "services/api/.env"], cwd=REPO_ROOT, check=False
    )
    if ignored.returncode != 0:
        pytest.fail("Refusing live tests: services/api/.env is not ignored by Git")
    return {key: value for key, value in dotenv_values(ENV_FILE).items() if value is not None}


@pytest.fixture
def pg_engine(monkeypatch):
    values = _configured_values()
    if values.get("INVENTORY_POSTGRES_TESTS") != "1":
        pytest.skip("Live PostgreSQL tests require INVENTORY_POSTGRES_TESTS=1 in services/api/.env")
    if values.get("INVENTORY_TEST_ENV") != "development":
        pytest.fail("Refusing live tests: set INVENTORY_TEST_ENV=development explicitly for an isolated database")
    raw_url = values.get("DATABASE_URL", "").strip()
    if not raw_url:
        pytest.skip("Live PostgreSQL tests blocked: DATABASE_URL is absent from services/api/.env")
    try:
        url = make_url(raw_url)
    except Exception:
        pytest.fail("Refusing live tests: DATABASE_URL in services/api/.env is invalid")
    if url.get_backend_name() != "postgresql":
        pytest.fail("Refusing live tests: DATABASE_URL must identify PostgreSQL")
    host = (url.host or "").lower()
    if not host.endswith(".pooler.supabase.com"):
        pytest.fail("Refusing live tests: expected the Supabase transaction-pooler host")
    username = url.username or ""
    database = (url.database or "").strip()
    if values.get("INVENTORY_TEST_ALLOWED_DATABASE_HOST", "").strip().lower() != host:
        pytest.fail("Refusing live tests: pooler host does not match the explicit development allowlist")
    if values.get("INVENTORY_TEST_ALLOWED_DATABASE_USER", "").strip() != username:
        pytest.fail("Refusing live tests: database user does not match the explicit development allowlist")
    if values.get("INVENTORY_TEST_ALLOWED_DATABASE_NAME", "").strip() != database:
        pytest.fail("Refusing live tests: database name does not match the explicit development allowlist")

    # Only load the DB URL obtained from the ignored local file; do not accept a
    # shell/CI URL as a substitute for the requested local configuration.
    monkeypatch.setenv("DATABASE_URL", raw_url)
    monkeypatch.setenv("INVENTORY_POSTGRES_TESTS", "1")
    monkeypatch.setenv("INVENTORY_TEST_ENV", "development")
    monkeypatch.setenv("INVENTORY_TEST_ALLOWED_DATABASE_HOST", host)
    monkeypatch.setenv("INVENTORY_TEST_ALLOWED_DATABASE_USER", username)
    monkeypatch.setenv("INVENTORY_TEST_ALLOWED_DATABASE_NAME", database)
    seed_host = values.get("INVENTORY_SEED_ALLOWED_DATABASE_HOST", "").strip().lower()
    seed_user = values.get("INVENTORY_SEED_ALLOWED_DATABASE_USER", "").strip()
    seed_database = values.get("INVENTORY_SEED_ALLOWED_DATABASE_NAME", "").strip()
    if seed_host:
        monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_HOST", seed_host)
    if seed_user:
        monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_USER", seed_user)
    if seed_database:
        monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_NAME", seed_database)
    from app.sql_database import get_engine

    get_engine.cache_clear()
    engine = get_engine()
    try:
        with engine.connect() as connection:
            connection.execute(text("select 1"))
        from app.inventory_models import Asset, AssetEntry, AssetExit  # noqa: F401

        SQLModel.metadata.create_all(engine)
    except Exception:
        engine.dispose()
        get_engine.cache_clear()
        pytest.fail("Live PostgreSQL connection/schema initialization failed; details suppressed to protect credentials")
    yield engine
    engine.dispose()
    get_engine.cache_clear()


def _new_asset(session: Session, *, sku: str | None = None, name: str = "PG test asset"):
    from app.inventory_models import Asset

    asset = Asset(name=name, sku=sku or f"PG-{uuid4().hex}", category="hardware", office="Valencia")
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


def _assert_db_rejects(session: Session, row) -> None:
    session.add(row)
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def _cleanup_sku(engine, sku: str) -> None:
    from app.inventory_models import Asset, AssetEntry, AssetExit

    with Session(engine) as session:
        asset = session.exec(select(Asset).where(Asset.sku == sku)).first()
        if asset is None:
            return
        session.exec(select(AssetEntry).where(AssetEntry.asset_id == asset.id).with_for_update())
        entries = session.exec(select(AssetEntry).where(AssetEntry.asset_id == asset.id)).all()
        exits = session.exec(select(AssetExit).where(AssetExit.asset_id == asset.id)).all()
        for row in entries + exits:
            session.delete(row)
        session.delete(asset)
        session.commit()


@pytest.mark.postgres_integration
def test_postgres_tables_foreign_keys_checks_and_unique_sku(pg_engine):
    from app.inventory_models import Asset, AssetEntry, AssetExit

    inspector = inspect(pg_engine)
    assert {"inventory_assets", "inventory_asset_entries", "inventory_asset_exits"}.issubset(
        set(inspector.get_table_names())
    )
    assert {fk["referred_table"] for fk in inspector.get_foreign_keys("inventory_asset_entries")} == {
        "inventory_assets"
    }
    assert {fk["referred_table"] for fk in inspector.get_foreign_keys("inventory_asset_exits")} == {
        "inventory_assets"
    }
    assert "users" not in inspector.get_table_names()

    sku = f"PG-{uuid4().hex}"
    try:
        with Session(pg_engine) as session:
            asset = _new_asset(session, sku=sku)
            _assert_db_rejects(
                session,
                Asset(name="duplicate", sku=sku, category="hardware", office="Valencia"),
            )
            _assert_db_rejects(
                session,
                Asset(name="bad category", sku=f"{sku}-C", category="invalid", office="Valencia"),
            )
            _assert_db_rejects(
                session,
                Asset(name="bad office", sku=f"{sku}-O", category="hardware", office="Paris"),
            )
            _assert_db_rejects(
                session,
                AssetEntry(asset_id=asset.id, quantity=0, supplier="supplier", office="Valencia", user_uuid=str(uuid4())),
            )
            _assert_db_rejects(
                session,
                AssetEntry(asset_id=asset.id, quantity=1, supplier="supplier", office="Paris", user_uuid=str(uuid4())),
            )
            _assert_db_rejects(
                session,
                AssetEntry(asset_id=-1, quantity=1, supplier="supplier", office="Valencia", user_uuid=str(uuid4())),
            )
            _assert_db_rejects(
                session,
                AssetExit(asset_id=asset.id, quantity=-1, exit_type="consumption", office="Valencia", user_uuid=str(uuid4())),
            )
    finally:
        _cleanup_sku(pg_engine, sku)


@pytest.mark.postgres_integration
def test_postgres_api_stock_calculation_and_order_persistence(pg_engine, monkeypatch):
    from fastapi.testclient import TestClient
    from app.auth import get_current_user
    from app.inventory_models import AssetEntry, AssetExit
    from app.main import app
    from app.sql_database import get_db

    sku = f"PG-{uuid4().hex}"
    user = {"id": 901, "user_uuid": str(uuid4()), "is_active": True, "email": "pg-test@example.invalid", "role": "user"}

    def database_dependency():
        with Session(pg_engine) as session:
            try:
                yield session
            except Exception:
                session.rollback()
                raise

    app.dependency_overrides[get_db] = database_dependency
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        with TestClient(app) as client:
            created = client.post("/inventory/products", json={
                "name": "PG integration asset", "sku": sku, "category": "hardware", "office": "Valencia"
            }, headers={"Authorization": "Bearer integration-test"})
            assert created.status_code == 201, "PostgreSQL product creation failed"
            asset = created.json()
            assert asset["current_stock"] == 0
            inbound = client.post("/inventory/orders/inbound", json={
                "asset_id": asset["id"], "quantity": 9, "supplier": "Integration supplier", "office": "Valencia"
            }, headers={"Authorization": "Bearer integration-test"})
            assert inbound.status_code == 201
            outbound = client.post("/inventory/orders/outbound", json={
                "asset_id": asset["id"], "quantity": 4, "exit_type": "allocation", "assigned_to": "Integration user", "office": "Valencia"
            }, headers={"Authorization": "Bearer integration-test"})
            assert outbound.status_code == 201
            detail = client.get(f"/inventory/products/{asset['id']}")
            assert detail.status_code == 200 and detail.json()["current_stock"] == 5
            orders = client.get("/inventory/orders").json()
            assert {order["user_uuid"] for order in orders if order["asset_id"] == asset["id"]} == {user["user_uuid"]}
        with Session(pg_engine) as session:
            assert len(session.exec(select(AssetEntry).where(AssetEntry.asset_id == asset["id"])).all()) == 1
            assert len(session.exec(select(AssetExit).where(AssetExit.asset_id == asset["id"])).all()) == 1
    finally:
        app.dependency_overrides.clear()
        _cleanup_sku(pg_engine, sku)


@pytest.mark.postgres_integration
def test_real_tinydb_login_uuid_is_persisted_on_postgres_order(pg_engine, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from app.database import get_profiles_table, get_users_table
    from app.inventory_models import AssetEntry
    from app.main import app

    from tinydb import TinyDB

    sku = f"PG-AUTH-{uuid4().hex}"
    tinydb = TinyDB(tmp_path / "inventory-auth-users.json")
    users = tinydb.table("users")
    profiles = tinydb.table("profiles")
    monkeypatch.setenv("JWT_SECRET_KEY", "postgres-auth-integration-test-secret-key")
    app.dependency_overrides[get_users_table] = lambda: users
    app.dependency_overrides[get_profiles_table] = lambda: profiles
    try:
        with TestClient(app) as client:
            registration = client.post("/users", json={"email": f"{uuid4().hex}@example.test", "password": "integration-password-123"})
            assert registration.status_code == 201
            email = registration.json()["email"]
            identity = users.get(doc_id=registration.json()["id"])
            assert identity and identity.get("user_uuid")
            login = client.post("/auth/login", data={"username": email, "password": "integration-password-123"})
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            created = client.post("/inventory/products", json={
                "name": "TinyDB/Postgres auth asset", "sku": sku, "category": "hardware", "office": "Valencia"
            }, headers=headers)
            assert created.status_code == 201
            inbound = client.post("/inventory/orders/inbound", json={
                "asset_id": created.json()["id"], "quantity": 2, "supplier": "Auth integration", "office": "Valencia"
            }, headers=headers)
            assert inbound.status_code == 201
            assert inbound.json()["user_uuid"] == identity["user_uuid"]
        with Session(pg_engine) as session:
            order = session.exec(select(AssetEntry).where(AssetEntry.asset_id == created.json()["id"])).one()
            assert order.user_uuid == identity["user_uuid"]
    finally:
        app.dependency_overrides.clear()
        tinydb.close()
        _cleanup_sku(pg_engine, sku)


@pytest.mark.postgres_integration
def test_postgres_concurrent_exits_do_not_oversell(pg_engine):
    from fastapi.testclient import TestClient
    from app.auth import get_current_user
    from app.inventory_models import Asset, AssetEntry, AssetExit
    from app.main import app
    from app.sql_database import get_db

    sku = f"PG-RACE-{uuid4().hex}"
    user = {"id": 902, "user_uuid": str(uuid4()), "is_active": True, "email": "race-test@example.invalid", "role": "user"}
    with Session(pg_engine) as session:
        asset = _new_asset(session, sku=sku)
        session.add(AssetEntry(asset_id=asset.id, quantity=5, supplier="Concurrency fixture", office="Valencia", user_uuid=user["user_uuid"]))
        session.commit()
        asset_id = asset.id

    barrier = threading.Barrier(2)
    pids: list[int] = []
    pid_lock = threading.Lock()

    def independent_session():
        with Session(pg_engine) as session:
            pid = session.exec(text("select pg_backend_pid()")).one()[0]
            with pid_lock:
                pids.append(int(pid))
            barrier.wait(timeout=20)
            try:
                yield session
            except Exception:
                session.rollback()
                raise

    app.dependency_overrides[get_db] = independent_session
    app.dependency_overrides[get_current_user] = lambda: user
    payload = {"asset_id": asset_id, "quantity": 4, "exit_type": "consumption", "assigned_to": None, "office": "Valencia"}
    try:
        with TestClient(app) as client:
            def request_exit():
                return client.post("/inventory/orders/outbound", json=payload, headers={"Authorization": "Bearer concurrent-test"})

            with ThreadPoolExecutor(max_workers=2) as executor:
                responses = list(executor.map(lambda _: request_exit(), range(2)))
        assert len(set(pids)) == 2, "Requests did not use two independent PostgreSQL connections"
        assert sorted(response.status_code for response in responses) == [201, 400]
        with Session(pg_engine) as session:
            exits = session.exec(select(AssetExit).where(AssetExit.asset_id == asset_id)).all()
            assert len(exits) == 1
            assert sum(row.quantity for row in exits) == 4
            assert session.get(Asset, asset_id).id == asset_id
            assert 5 - sum(row.quantity for row in exits) == 1
    finally:
        app.dependency_overrides.clear()
        _cleanup_sku(pg_engine, sku)


@pytest.mark.postgres_integration
def test_postgres_seed_exact_counts_net_stock_and_idempotency(pg_engine, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from app.database import get_profiles_table, get_users_table
    from app.inventory_models import Asset, AssetEntry, AssetExit
    from app.inventory_seed import seed_inventory
    from app.main import app
    from app.sql_database import database_url_from_environment
    from app import inventory_seed as seed_module
    from tinydb import TinyDB

    values = _configured_values()
    if values.get("INVENTORY_SEED_ENV") != "development":
        pytest.skip("Live seed verification blocked: explicitly set INVENTORY_SEED_ENV=development in services/api/.env")
    url_host = (database_url_from_environment().host or "").lower()
    if values.get("INVENTORY_SEED_ALLOWED_DATABASE_HOST", "").strip().lower() != url_host:
        pytest.fail("Refusing seed verification: seed host allowlist does not match the development database")
    parsed_url = make_url(values["DATABASE_URL"])
    if values.get("INVENTORY_SEED_ALLOWED_DATABASE_USER", "").strip() != (parsed_url.username or ""):
        pytest.fail("Refusing seed verification: seed user allowlist does not match the development database")
    if values.get("INVENTORY_SEED_ALLOWED_DATABASE_NAME", "").strip() != (parsed_url.database or ""):
        pytest.fail("Refusing seed verification: seed database allowlist does not match the development database")

    tinydb = TinyDB(tmp_path / "inventory-seed-users.json")
    users = tinydb.table("users")
    profiles = tinydb.table("profiles")
    monkeypatch.setenv("JWT_SECRET_KEY", "postgres-seed-integration-test-secret-key")
    app.dependency_overrides[get_users_table] = lambda: users
    app.dependency_overrides[get_profiles_table] = lambda: profiles
    try:
        with TestClient(app) as client:
            registration = client.post("/users", json={"email": f"seed-{uuid4().hex}@example.test", "password": "seed-integration-password-123"})
            assert registration.status_code == 201
        user = users.get(doc_id=registration.json()["id"])
        assert user and user.get("is_active") and user.get("user_uuid")
        monkeypatch.setenv("INVENTORY_SEED_ENV", "development")
        monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_HOST", url_host)
        monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_USER", parsed_url.username or "")
        monkeypatch.setenv("INVENTORY_SEED_ALLOWED_DATABASE_NAME", parsed_url.database or "")
        monkeypatch.setattr(seed_module, "get_users_table", lambda: users)
        first = seed_inventory()
        second = seed_inventory()
        assert first == {"assets": 6, "entries": 4, "exits": 3}
        assert second == {"assets": 0, "entries": 0, "exits": 0}
        expected = {
            "NXV-IT-001": ("Portátil 14\" Business", "hardware", "Valencia", 12),
            "NXV-IT-002": ("Portátil 14\" Business", "hardware", "Miami", 8),
            "NXV-PER-001": ("Ratón ergonómico", "peripherals", "Valencia", 17),
            "NXV-PER-002": ("Hub USB-C", "peripherals", "Miami", 0),
            "NXV-OFF-001": ("Resma de papel A4", "office_supplies", "Valencia", 0),
            "NXV-TRN-001": ("Cuaderno de formación en liderazgo", "training_materials", "Valencia", 0),
        }
        with Session(pg_engine) as session:
            assets = session.exec(select(Asset).where(Asset.sku.in_(expected))).all()
            assert len(assets) == 6
            assert len(session.exec(select(AssetEntry).where(AssetEntry.asset_id.in_([a.id for a in assets]))).all()) == 4
            assert len(session.exec(select(AssetExit).where(AssetExit.asset_id.in_([a.id for a in assets]))).all()) == 3
            for asset in assets:
                name, category, office, stock = expected[asset.sku]
                assert (asset.name, asset.category, asset.office) == (name, category, office)
                entries = session.exec(select(AssetEntry).where(AssetEntry.asset_id == asset.id)).all()
                exits = session.exec(select(AssetExit).where(AssetExit.asset_id == asset.id)).all()
                assert all(row.user_uuid == user["user_uuid"] for row in entries + exits)
                assert sum(row.quantity for row in entries) - sum(row.quantity for row in exits) == stock
    finally:
        app.dependency_overrides.clear()
        tinydb.close()
