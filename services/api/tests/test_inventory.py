from collections import Counter

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from app.auth import get_current_user
from app.inventory_models import Asset, AssetEntry, AssetExit
from app.main import app
from app.sql_database import get_db


@pytest.fixture
def inventory_client(tmp_path, monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "inventory-test-secret-at-least-32-chars")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    from sqlmodel import Session

    def db_session():
        with Session(engine) as session:
            yield session

    user = {"id": 23, "user_uuid": "d67bdd0d-dd09-49c9-9fc3-8aac1130217d", "is_active": True, "email": "db-only@example.test", "role": "user"}
    app.dependency_overrides[get_db] = db_session
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app) as client:
        yield client, engine, user
    app.dependency_overrides.clear()
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


def auth_headers():
    # In this fixture get_current_user itself is overridden; write routes still resolve it.
    return {"Authorization": "Bearer test"}


def create_asset(client, **changes):
    data = {"name": "Laptop", "sku": "TEST-001", "category": "hardware", "office": "Valencia"}
    data.update(changes)
    return client.post("/inventory/products", json=data, headers=auth_headers())


def test_product_create_initial_zero_and_public_list_detail(inventory_client):
    client, _, _ = inventory_client
    created = create_asset(client)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["current_stock"] == 0 and "current_stock" not in Asset.model_fields
    assert client.get("/inventory/products").json() == [body]
    assert client.get(f"/inventory/products/{body['id']}").json() == body
    assert client.get("/inventory/products/999").status_code == 404


def test_unique_sku_and_fields_validation(inventory_client):
    client, _, _ = inventory_client
    assert create_asset(client).status_code == 201
    assert create_asset(client, name="Duplicate").status_code == 409
    assert create_asset(client, sku="TEST-002", category="unknown").status_code == 422
    assert create_asset(client, sku="TEST-003", office="Paris").status_code == 422
    assert client.post("/inventory/products", json={"name":"a","sku":"s","category":"hardware","office":"Valencia","current_stock":5}, headers=auth_headers()).status_code == 422


def test_inbound_outbound_attribution_office_and_stock(inventory_client):
    client, _, user = inventory_client
    asset = create_asset(client).json()
    inbound = {"asset_id": asset["id"], "quantity": 10, "supplier": "Trusted Supplier", "office": "Valencia"}
    response = client.post("/inventory/orders/inbound", json=inbound, headers=auth_headers())
    assert response.status_code == 201, response.text
    assert response.json()["user_uuid"] == user["user_uuid"]
    assert client.get(f"/inventory/products/{asset['id']}").json()["current_stock"] == 10
    assert client.post("/inventory/orders/inbound", json={**inbound, "office":"Miami"}, headers=auth_headers()).status_code == 422
    outbound = {"asset_id": asset["id"], "quantity": 4, "exit_type":"allocation", "assigned_to":"Employee", "office":"Valencia"}
    result = client.post("/inventory/orders/outbound", json=outbound, headers=auth_headers())
    assert result.status_code == 201 and result.json()["user_uuid"] == user["user_uuid"]
    assert client.get(f"/inventory/products/{asset['id']}").json()["current_stock"] == 6
    orders = client.get("/inventory/orders").json()
    assert len(orders) == 2 and all("asset_name" in order for order in orders)
    assert {order["user_uuid"] for order in orders} == {user["user_uuid"]}


def test_insufficient_stock_is_exact_and_does_not_write(inventory_client):
    client, engine, _ = inventory_client
    asset = create_asset(client).json()
    payload = {"asset_id":asset["id"],"quantity":1,"exit_type":"consumption","assigned_to":None,"office":"Valencia"}
    rejected = client.post("/inventory/orders/outbound", json=payload, headers=auth_headers())
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "Insufficient stock for asset 'Laptop'. Available: 0, requested: 1."
    with engine.connect() as connection:
        assert connection.exec_driver_sql("select count(*) from inventory_asset_exits").scalar_one() == 0


@pytest.mark.parametrize("kind,assigned,valid", [("allocation",None,False),("allocation","E",True),("consumption","E",False),("consumption",None,True)])
def test_exit_type_assignment_validation(inventory_client, kind, assigned, valid):
    client, _, _ = inventory_client
    asset = create_asset(client).json()
    client.post("/inventory/orders/inbound", json={"asset_id":asset["id"],"quantity":1,"supplier":"S","office":"Valencia"}, headers=auth_headers())
    payload = {"asset_id":asset["id"],"quantity":1,"exit_type":kind,"assigned_to":assigned,"office":"Valencia"}
    response = client.post("/inventory/orders/outbound", json=payload, headers=auth_headers())
    assert (response.status_code == 201) == valid
    if not valid:
        assert response.status_code == 422


def test_authentication_fk_constraints_and_order_listing_queries(inventory_client):
    client, engine, _ = inventory_client
    asset = create_asset(client).json()
    # Writes resolve to auth dependency; override removed temporarily to test auth layer explicitly.
    original = app.dependency_overrides.pop(get_current_user)
    try:
        assert client.post("/inventory/products", json={"name":"x","sku":"x","category":"hardware","office":"Valencia"}).status_code == 401
    finally:
        app.dependency_overrides[get_current_user] = original
    with engine.connect() as conn:
        # ORM schema contains real asset FKs and no user table.
        fk_entry = SQLModel.metadata.tables["inventory_asset_entries"].foreign_keys
        fk_exit = SQLModel.metadata.tables["inventory_asset_exits"].foreign_keys
        assert {fk.target_fullname for fk in fk_entry} == {"inventory_assets.id"}
        assert {fk.target_fullname for fk in fk_exit} == {"inventory_assets.id"}
        assert "users" not in SQLModel.metadata.tables
    assert client.post("/inventory/orders/inbound", json={"asset_id":999,"quantity":1,"supplier":"s","office":"Valencia"}, headers=auth_headers()).status_code == 404


def test_seed_is_idempotent_with_existing_tinydb_user(monkeypatch, tmp_path):
    from tinydb import TinyDB
    import app.inventory_seed as seed

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    tiny = TinyDB(tmp_path / "users.json")
    tiny.table("users").insert({"id": 4, "is_active": True, "user_uuid": "d67bdd0d-dd09-49c9-9fc3-8aac1130217d"})
    monkeypatch.setenv("INVENTORY_SEED_ENV", "development")
    monkeypatch.setattr(seed, "get_engine", lambda: engine)
    monkeypatch.setattr(seed, "get_users_table", lambda: tiny.table("users"))
    first = seed.seed_inventory()
    second = seed.seed_inventory()
    assert first == {"assets": 6, "entries": 4, "exits": 3}
    assert second == {"assets": 0, "entries": 0, "exits": 0}
    with __import__("sqlmodel").Session(engine) as db:
        assets = db.scalars(__import__("sqlalchemy").select(Asset)).all()
        assert len(assets) == 6
        assert len(db.scalars(__import__("sqlalchemy").select(AssetEntry)).all()) == 4
        assert len(db.scalars(__import__("sqlalchemy").select(AssetExit)).all()) == 3
        it_asset = db.scalars(__import__("sqlalchemy").select(Asset).where(Asset.sku == "NXV-IT-001")).one()
        mouse = db.scalars(__import__("sqlalchemy").select(Asset).where(Asset.sku == "NXV-PER-001")).one()
        from sqlalchemy import func
        inbound_it = db.scalar(__import__("sqlalchemy").select(func.sum(AssetEntry.quantity)).where(AssetEntry.asset_id == it_asset.id))
        outbound_it = db.scalar(__import__("sqlalchemy").select(func.sum(AssetExit.quantity)).where(AssetExit.asset_id == it_asset.id))
        inbound_mouse = db.scalar(__import__("sqlalchemy").select(func.sum(AssetEntry.quantity)).where(AssetEntry.asset_id == mouse.id))
        outbound_mouse = db.scalar(__import__("sqlalchemy").select(func.sum(AssetExit.quantity)).where(AssetExit.asset_id == mouse.id))
        assert inbound_it - outbound_it == 12
        assert inbound_mouse - outbound_mouse == 17
    tiny.close()
    engine.dispose()


def test_queries_order_list_without_n_plus_one(inventory_client):
    client, engine, _ = inventory_client
    for i in range(3):
        asset = create_asset(client, sku=f"SKU-{i}").json()
        client.post("/inventory/orders/inbound", json={"asset_id":asset["id"],"quantity":2,"supplier":"S","office":"Valencia"}, headers=auth_headers())
    seen = []
    def count_queries(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().lower().startswith("select"):
            seen.append(statement)
    event.listen(engine, "before_cursor_execute", count_queries)
    try:
        assert len(client.get("/inventory/orders").json()) == 3
    finally:
        event.remove(engine, "before_cursor_execute", count_queries)
    assert len(seen) <= 2
