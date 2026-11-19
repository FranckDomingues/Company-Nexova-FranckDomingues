from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from tinydb import TinyDB

from app.database import _database_for, get_profiles_table, get_suppliers_table, get_users_table
from app.main import app
from app.seed import seed_suppliers


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "suppliers.json"
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(path))
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-signing-secret-with-at-least-32-chars")
    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    _database_for.cache_clear()

    def test_table():
        return _database_for(str(path)).table("suppliers")

    def test_users_table():
        return _database_for(str(path)).table("users")

    def test_profiles_table():
        return _database_for(str(path)).table("profiles")

    app.dependency_overrides[get_suppliers_table] = test_table
    app.dependency_overrides[get_users_table] = test_users_table
    app.dependency_overrides[get_profiles_table] = test_profiles_table
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    _database_for.cache_clear()


def register(client, email="user@example.com", password="correct-horse-battery"):
    return client.post("/users", json={"email": email, "password": password})


def login(client, email="user@example.com", password="correct-horse-battery"):
    return client.post("/auth/login", data={"username": email, "password": password})


def bearer(client, email="user@example.com", role="user"):
    response = register(client, email)
    assert response.status_code == 201
    if role != "user":
        users = client.app.dependency_overrides[get_users_table]()
        users.update({"role": role}, doc_ids=[response.json()["id"]])
    token = login(client, email).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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
    headers = bearer(client, role="manager")
    created = client.post("/suppliers", json=supplier_payload(), headers=headers)
    assert created.status_code == 201
    record = created.json()
    assert record["id"] > 0
    assert record["updated_at"]
    assert client.get("/suppliers", headers=headers).json() == [record]
    assert client.get("/suppliers?country=USA", headers=headers).json() == []
    assert client.get("/suppliers?category=ats_software", headers=headers).json() == [record]
    assert client.get("/suppliers?category=unknown", headers=headers).status_code == 422
    assert client.get(f"/suppliers/{record['id']}", headers=headers).json() == record
    assert client.get("/suppliers/999", headers=headers).status_code == 404
    assert client.delete(f"/suppliers/{record['id']}", headers=headers).status_code == 204
    assert client.delete(f"/suppliers/{record['id']}", headers=headers).status_code == 404


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
    response = client.post("/suppliers", json=supplier_payload(**changes), headers=bearer(client, role="manager"))
    assert response.status_code == 422
    assert client.get("/suppliers", headers={"Authorization": f"Bearer {login(client).json()['access_token']}"}).json() == []


def test_rate_and_status_updates_validate_and_update_timestamp(client):
    headers = bearer(client, role="manager")
    record = client.post("/suppliers", json=supplier_payload(), headers=headers).json()
    original_timestamp = datetime.fromisoformat(record["updated_at"].replace("Z", "+00:00"))

    assert client.patch(f"/suppliers/{record['id']}/rate", json={"monthly_rate": 0}, headers=headers).status_code == 422
    updated = client.patch(f"/suppliers/{record['id']}/rate", json={"monthly_rate": 125.25}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["monthly_rate"] == 125.25
    assert datetime.fromisoformat(updated.json()["updated_at"].replace("Z", "+00:00")) >= original_timestamp

    assert client.patch(f"/suppliers/{record['id']}/status", json={"status": "inactive"}, headers=headers).status_code == 422
    status_response = client.patch(f"/suppliers/{record['id']}/status", json={"status": "suspended"}, headers=headers)
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "suspended"


def test_seed_is_idempotent_and_persists_to_database(client, tmp_path):
    inserted_first = seed_suppliers()
    inserted_second = seed_suppliers()
    assert inserted_first == 15
    assert inserted_second == 0
    assert len(get_suppliers_table()) == 15
    assert len(client.get("/suppliers", headers=bearer(client, role="manager")).json()) == 15

    reopened = TinyDB(tmp_path / "suppliers.json")
    assert len(reopened.table("suppliers")) == 15
    reopened.close()
