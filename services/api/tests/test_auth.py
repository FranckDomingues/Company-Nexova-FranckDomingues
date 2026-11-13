from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.auth import ALGORITHM, create_access_token, hash_password
from app.database import _database_for, get_profiles_table, get_suppliers_table, get_users_table
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "isolated-auth-test.json"
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(path))
    monkeypatch.setenv("JWT_SECRET_KEY", "isolated-test-secret-that-is-long-enough")
    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "5")
    _database_for.cache_clear()
    app.dependency_overrides[get_users_table] = lambda: _database_for(str(path)).table("users")
    app.dependency_overrides[get_profiles_table] = lambda: _database_for(str(path)).table("profiles")
    app.dependency_overrides[get_suppliers_table] = lambda: _database_for(str(path)).table("suppliers")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    _database_for.cache_clear()


def signup(client, email="person@example.com", **extra):
    return client.post("/users", json={"email": email, "password": "strong-password-123", **extra})


def token(client, email="person@example.com", password="strong-password-123"):
    response = client.post("/auth/login", data={"username": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def headers(value):
    return {"Authorization": f"Bearer {value}"}


def test_register_creates_normalized_user_and_single_profile(client):
    response = client.post("/users", json={"email": "Person@Example.COM", "password": "strong-password-123", "name": " Pat ", "phone": "123", "address": "Here", "role": "admin", "is_active": False})
    assert response.status_code == 201
    user = response.json()
    assert user["role"] == "user" and user["is_active"] is True
    assert "hashed_password" not in user and "password" not in user
    users = client.app.dependency_overrides[get_users_table]()
    profiles = client.app.dependency_overrides[get_profiles_table]()
    assert users.get(doc_id=user["id"])["email"] == "person@example.com"
    assert users.get(doc_id=user["id"])["hashed_password"] != "strong-password-123"
    assert len(profiles) == 1
    profile = profiles.all()[0]
    assert profile == {"user_id": user["id"], "name": "Pat", "phone": "123", "address": "Here", "id": profile["id"]}


def test_unique_normalized_email_and_role_validation(client):
    assert signup(client).status_code == 201
    assert signup(client, "PERSON@example.com").status_code == 409
    assert signup(client, "other@example.com", role="root").status_code == 422


def test_password_login_and_auth_me_exclude_hashes(client):
    signup(client, name="Ada")
    assert client.post("/auth/login", data={"username": "person@example.com", "password": "wrong-password"}).status_code == 401
    token_value = token(client)
    response = client.get("/auth/me", headers=headers(token_value))
    assert response.status_code == 200
    assert response.json() == {"email": "person@example.com", "role": "user", "profile": {"id": 1, "user_id": 1, "name": "Ada", "phone": None, "address": None}}
    assert "hashed_password" not in response.text


def test_jwt_subject_signature_and_configured_expiration(client):
    signup(client)
    token_value = token(client)
    claims = jwt.decode(token_value, "isolated-test-secret-that-is-long-enough", algorithms=[ALGORITHM])
    assert claims["sub"] == "1"
    assert claims["exp"] - claims["iat"] == 300
    assert client.get("/auth/me", headers=headers(create_access_token(1, timedelta(seconds=-1)))).status_code == 401
    assert client.get("/auth/me", headers=headers(jwt.encode({"sub": "1"}, "incorrect-secret-that-is-long-enough", algorithm=ALGORITHM))).status_code == 401


@pytest.mark.parametrize("authorization", [None, "Bearer", "Bearer not-a-jwt", "Basic abc"])
def test_missing_or_malformed_tokens_are_401(client, authorization):
    response = client.get("/auth/me", headers={} if authorization is None else {"Authorization": authorization})
    assert response.status_code == 401


def test_inactive_and_deleted_users_cannot_use_existing_tokens(client):
    signup(client)
    token_value = token(client)
    table = client.app.dependency_overrides[get_users_table]()
    table.update({"is_active": False}, doc_ids=[1])
    assert client.get("/auth/me", headers=headers(token_value)).status_code == 401
    table.remove(doc_ids=[1])
    assert client.get("/auth/me", headers=headers(token_value)).status_code == 401


def test_profile_me_and_user_ownership_and_admin_operations(client):
    first = signup(client, "first@example.com").json()
    second = signup(client, "second@example.com").json()
    first_token = token(client, "first@example.com")
    second_token = token(client, "second@example.com")
    assert client.get("/profiles/me").status_code == 401
    assert client.get("/profiles/me", headers=headers(first_token)).status_code == 200
    assert client.put("/profiles/me", json={"name": "First"}, headers=headers(first_token)).json()["name"] == "First"
    assert client.get(f"/users/{second['id']}", headers=headers(first_token)).status_code == 403
    assert client.put(f"/users/{second['id']}", json={"email": "stolen@example.com"}, headers=headers(first_token)).status_code == 403
    assert client.get("/users").status_code == 401
    assert client.get("/users", headers=headers(first_token)).status_code == 403
    assert client.put(f"/users/{first['id']}", json={"role": "admin"}, headers=headers(first_token)).status_code == 403
    assert client.put(f"/users/{first['id']}", json={"role": None}, headers=headers(first_token)).status_code == 422
    assert client.put(f"/users/{first['id']}", json={"password": "new-password-456"}, headers=headers(first_token)).status_code == 200
    assert client.post("/auth/login", data={"username": "first@example.com", "password": "new-password-456"}).status_code == 200
    table = client.app.dependency_overrides[get_users_table]()
    table.update({"role": "admin"}, doc_ids=[first["id"]])
    admin_token = token(client, "first@example.com", "new-password-456")
    assert client.get("/users", headers=headers(admin_token)).status_code == 200
    assert client.put(f"/users/{second['id']}", json={"role": "manager", "is_active": False}, headers=headers(admin_token)).status_code == 200
    assert client.post("/auth/login", data={"username": "second@example.com", "password": "strong-password-123"}).status_code == 401
    assert client.delete(f"/users/{second['id']}", headers=headers(admin_token)).status_code == 204
    assert client.get(f"/users/{second['id']}", headers=headers(admin_token)).status_code == 404
    assert len(client.app.dependency_overrides[get_profiles_table]()) == 1


def test_user_delete_own_and_linked_profile_and_user_crud(client):
    user = signup(client).json()
    user_token = token(client)
    assert client.put(f"/users/{user['id']}", json={"email": "updated@example.com"}, headers=headers(user_token)).status_code == 200
    updated_token = token(client, "updated@example.com")
    assert client.delete(f"/users/{user['id']}", headers=headers(updated_token)).status_code == 204
    assert len(client.app.dependency_overrides[get_users_table]()) == 0
    assert len(client.app.dependency_overrides[get_profiles_table]()) == 0


def test_public_health_endpoint_remains_available_without_auth(client):
    assert client.get("/health").status_code == 200
    assert client.get("/health").json() == {"status": "ok"}


def test_existing_sensitive_supplier_routes_require_manager_or_admin(client):
    signup(client)
    supplier = {"name": "V", "country": "Spain", "categories": ["ats_software"], "monthly_rate": 10, "currency": "EUR", "status": "active"}
    routes = [
        ("POST", "/suppliers", {"json": supplier}),
        ("GET", "/suppliers", {}),
        ("GET", "/suppliers/1", {}),
        ("PATCH", "/suppliers/1/rate", {"json": {"monthly_rate": 20}}),
        ("PATCH", "/suppliers/1/status", {"json": {"status": "suspended"}}),
        ("DELETE", "/suppliers/1", {}),
    ]
    for method, path, kwargs in routes:
        assert client.request(method, path, **kwargs).status_code == 401
    user_token = token(client)
    assert client.get("/suppliers", headers=headers(user_token)).status_code == 403
    table = client.app.dependency_overrides[get_users_table]()
    table.update({"role": "manager"}, doc_ids=[1])
    manager_token = token(client)
    created = client.post("/suppliers", json=supplier, headers=headers(manager_token))
    assert created.status_code == 201
    supplier_id = created.json()["id"]
    assert client.get("/suppliers", headers=headers(manager_token)).status_code == 200
    assert client.get(f"/suppliers/{supplier_id}", headers=headers(manager_token)).status_code == 200
    assert client.patch(f"/suppliers/{supplier_id}/rate", json={"monthly_rate": 20}, headers=headers(manager_token)).status_code == 200
    assert client.patch(f"/suppliers/{supplier_id}/status", json={"status": "suspended"}, headers=headers(manager_token)).status_code == 200
    assert client.delete(f"/suppliers/{supplier_id}", headers=headers(manager_token)).status_code == 204


def test_supplier_list_rejects_invalid_tokens_and_accepts_manager_token(client):
    signup(client)

    assert client.get("/suppliers").status_code == 401
    assert client.get("/suppliers", headers=headers("malformed.token.value")).status_code == 401
    expired_token = create_access_token(1, timedelta(seconds=-1))
    assert client.get("/suppliers", headers=headers(expired_token)).status_code == 401

    users = client.app.dependency_overrides[get_users_table]()
    users.update({"role": "manager"}, doc_ids=[1])
    manager_token = token(client)
    response = client.get("/suppliers", headers=headers(manager_token))
    assert response.status_code == 200
    assert response.json() == []


def test_user_and_profile_data_live_only_in_tinydb_tables(client):
    signup(client)
    users = client.app.dependency_overrides[get_users_table]()
    profiles = client.app.dependency_overrides[get_profiles_table]()
    assert users.name == "users" and profiles.name == "profiles"
    assert users.all()[0].keys() == {"id", "email", "hashed_password", "is_active", "role", "created_at"}
    assert profiles.all()[0].keys() == {"id", "user_id", "name", "phone", "address"}


def test_registration_password_length_boundaries_and_empty_password(client):
    assert client.post("/users", json={"email": "empty@example.com", "password": ""}).status_code == 422
    minimum = client.post("/users", json={"email": "min@example.com", "password": "12345678"})
    assert minimum.status_code == 201
    maximum = client.post("/users", json={"email": "max@example.com", "password": "x" * 128})
    assert maximum.status_code == 201
    too_long = client.post("/users", json={"email": "long@example.com", "password": "x" * 129})
    assert too_long.status_code == 422


def test_login_empty_unknown_and_inactive_account_failures(client):
    signup(client)
    assert client.post("/auth/login", data={"username": "person@example.com", "password": " "}).status_code == 401
    assert client.post("/auth/login", data={"username": "missing@example.com", "password": "strong-password-123"}).status_code == 401
    users = client.app.dependency_overrides[get_users_table]()
    users.update({"is_active": False}, doc_ids=[1])
    inactive = client.post("/auth/login", data={"username": "person@example.com", "password": "strong-password-123"})
    assert inactive.status_code == 401
    assert inactive.json()["detail"] == "Inactive account"


def test_tokens_missing_exp_claim_and_expiration_boundary_are_rejected(client):
    signup(client)
    missing_exp = jwt.encode({"sub": "1", "iat": 1}, "isolated-test-secret-that-is-long-enough", algorithm=ALGORITHM)
    assert client.get("/auth/me", headers=headers(missing_exp)).status_code == 401
    exact_expiry = jwt.encode({"sub": "1", "iat": 1, "exp": 1}, "isolated-test-secret-that-is-long-enough", algorithm=ALGORITHM)
    assert client.get("/auth/me", headers=headers(exact_expiry)).status_code == 401


def test_registration_rolls_back_user_when_profile_insert_fails(client, monkeypatch):
    users = client.app.dependency_overrides[get_users_table]()
    profiles = client.app.dependency_overrides[get_profiles_table]()

    def fail_profile_insert(document):
        raise RuntimeError("test-only profile write failure")

    monkeypatch.setattr(profiles, "insert", fail_profile_insert)
    with pytest.raises(RuntimeError, match="test-only"):
        client.post("/users", json={"email": "rollback@example.com", "password": "strong-password-123"})
    assert users.all() == []
    assert profiles.all() == []
