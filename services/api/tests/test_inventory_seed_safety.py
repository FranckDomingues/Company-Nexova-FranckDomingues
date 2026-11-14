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
