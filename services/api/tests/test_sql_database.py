"""Tests for independent PostgreSQL connection configuration (no live DB needed)."""

import pytest
from sqlalchemy.engine import URL

from app.sql_database import database_url_from_environment


def test_database_url_is_required(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        database_url_from_environment()


def test_database_url_requires_postgresql_and_enforces_tls(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:6543/db")
    url = database_url_from_environment()
    assert isinstance(url, URL)
    assert url.get_backend_name() == "postgresql"
    assert url.query["sslmode"] == "require"
    assert url.port == 6543


def test_non_postgresql_database_is_rejected(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///local.db")
    with pytest.raises(RuntimeError, match="must use PostgreSQL"):
        database_url_from_environment()


def test_existing_tls_query_is_overridden_to_require(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:6543/db?sslmode=disable")
    assert database_url_from_environment().query["sslmode"] == "require"
