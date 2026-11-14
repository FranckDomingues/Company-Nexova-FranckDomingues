"""Keep ordinary tests away from inherited developer/production DB credentials."""

import pytest


@pytest.fixture(autouse=True)
def prevent_ambient_database_url(request, monkeypatch):
    """Only opt-in PostgreSQL integration tests may use the local URL."""
    if request.node.get_closest_marker("postgres_integration") is None:
        monkeypatch.delenv("DATABASE_URL", raising=False)
