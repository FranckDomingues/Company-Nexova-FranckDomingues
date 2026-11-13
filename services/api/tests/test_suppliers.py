from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from tinydb import TinyDB

from app.database import _database_for, get_suppliers_table
from app.main import app
from app.seed import seed_suppliers


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "suppliers.json"
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(path))
    _database_for.cache_clear()

    def test_table():
        return _database_for(str(path)).table("suppliers")

    app.dependency_overrides[get_suppliers_table] = test_table
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    _database_for.cache_clear()


def supplier_payload(**changes):
    payload = {
        "name": "Test Provider",
        "country": "Spain",
        "categories": ["ats_software"],
        "monthly_rate": 99.5,
        "currency": "EUR",
        "status": "active",
    }
    payload.update(changes)
    return payload


def test_create_list_filter_detail_and_delete(client):
    created = client.post("/suppliers", json=supplier_payload())
    assert created.status_code == 201
    record = created.json()
    assert record["id"] > 0
    assert record["updated_at"]
    assert client.get("/suppliers").json() == [record]
    assert client.get("/suppliers?country=USA").json() == []
    assert client.get("/suppliers?category=ats_software").json() == [record]
    assert client.get("/suppliers?category=unknown").status_code == 422
    assert client.get(f"/suppliers/{record['id']}").json() == record
    assert client.get("/suppliers/999").status_code == 404
    assert client.delete(f"/suppliers/{record['id']}").status_code == 204
    assert client.delete(f"/suppliers/{record['id']}").status_code == 404


@pytest.mark.parametrize(
    "changes",
    [
        {"status": "pending"},
        {"monthly_rate": 0},
        {"monthly_rate": -1},
        {"categories": []},
        {"categories": ["made_up_category"]},
        {"country": "Spain", "currency": "USD"},
        {"country": "Canada"},
        {"updated_at": "2025-01-01T00:00:00Z"},
    ],
)
def test_invalid_supplier_payload_is_422_before_persistence(client, changes):
    response = client.post("/suppliers", json=supplier_payload(**changes))
    assert response.status_code == 422
    assert client.get("/suppliers").json() == []


def test_rate_and_status_updates_validate_and_update_timestamp(client):
    record = client.post("/suppliers", json=supplier_payload()).json()
    original_timestamp = datetime.fromisoformat(record["updated_at"].replace("Z", "+00:00"))

    assert client.patch(f"/suppliers/{record['id']}/rate", json={"monthly_rate": 0}).status_code == 422
    updated = client.patch(f"/suppliers/{record['id']}/rate", json={"monthly_rate": 125.25})
    assert updated.status_code == 200
    assert updated.json()["monthly_rate"] == 125.25
    assert datetime.fromisoformat(updated.json()["updated_at"].replace("Z", "+00:00")) >= original_timestamp

    assert client.patch(f"/suppliers/{record['id']}/status", json={"status": "inactive"}).status_code == 422
    status_response = client.patch(f"/suppliers/{record['id']}/status", json={"status": "suspended"})
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "suspended"


def test_seed_is_idempotent_and_persists_to_database(client, tmp_path):
    inserted_first = seed_suppliers()
    inserted_second = seed_suppliers()
    assert inserted_first == 15
    assert inserted_second == 0
    assert len(get_suppliers_table()) == 15
    assert len(client.get("/suppliers").json()) == 15

    reopened = TinyDB(tmp_path / "suppliers.json")
    assert len(reopened.table("suppliers")) == 15
    reopened.close()
