"""Idempotent development seed; requires an existing TinyDB user with UUID."""

import os

from sqlalchemy import select
from sqlmodel import Session

from app.database import get_users_table
from app.inventory_models import Asset, AssetEntry, AssetExit
from app.sql_database import database_url_from_environment, get_engine


def _assert_seed_database_is_approved() -> None:
    """Require an explicit development opt-in and exact approved pooler host."""
    if os.environ.get("INVENTORY_SEED_ENV") != "development":
        raise RuntimeError("Set INVENTORY_SEED_ENV=development explicitly to run the inventory seed")

    # The allowlisted hostname identifies the dedicated Supabase development project.
    # Never include either value in errors: DATABASE_URL contains credentials.
    url = database_url_from_environment()
    host = (url.host or "").lower()
    approved_host = os.environ.get("INVENTORY_SEED_ALLOWED_DATABASE_HOST", "").strip().lower()
    username = url.username or ""
    approved_username = os.environ.get("INVENTORY_SEED_ALLOWED_DATABASE_USER", "").strip()
    database = (url.database or "").strip()
    approved_database = os.environ.get("INVENTORY_SEED_ALLOWED_DATABASE_NAME", "").strip()
    if (
        not host
        or not host.endswith(".pooler.supabase.com")
        or not approved_host
        or host != approved_host
        or not username
        or not approved_username
        or username != approved_username
        or not database
        or not approved_database
        or database != approved_database
    ):
        raise RuntimeError(
            "Inventory seed requires an explicitly allowlisted isolated Supabase development host, user, and database"
        )

ASSETS = [
    ("Portátil 14\" Business", "NXV-IT-001", "hardware", "Valencia"),
    ("Portátil 14\" Business", "NXV-IT-002", "hardware", "Miami"),
    ("Ratón ergonómico", "NXV-PER-001", "peripherals", "Valencia"),
    ("Hub USB-C", "NXV-PER-002", "peripherals", "Miami"),
    ("Resma de papel A4", "NXV-OFF-001", "office_supplies", "Valencia"),
    ("Cuaderno de formación en liderazgo", "NXV-TRN-001", "training_materials", "Valencia"),
]


def seed_inventory() -> dict[str, int]:
    _assert_seed_database_is_approved()
    users = get_users_table().all()
    valid = [str(u.get("user_uuid")) for u in users if u.get("is_active") and u.get("user_uuid")]
    if not valid:
        raise RuntimeError("Create an authorized TinyDB user first; inventory seed does not create identities")
    user_uuid = valid[0]
    counts = {"assets": 0, "entries": 0, "exits": 0}
    with Session(get_engine()) as db:
        for name, sku, category, office in ASSETS:
            asset = db.exec(select(Asset).where(Asset.sku == sku)).first()
            if asset is None:
                asset = Asset(name=name, sku=sku, category=category, office=office)
                db.add(asset)
                db.flush()
                counts["assets"] += 1
        db.flush()
        asset_by_sku = {a.sku: a for a in db.scalars(select(Asset).where(Asset.sku.in_([a[1] for a in ASSETS]))).all()}
        entries = [
            ("NXV-IT-001", 10, "TechDistrib Valencia S.L."),
            ("NXV-IT-001", 5, "TechDistrib Valencia S.L."),
            ("NXV-PER-001", 20, "Office Depot Valencia"),
            ("NXV-IT-002", 8, "TechDistrib Miami"),
        ]
        for sku, qty, supplier in entries:
            asset = asset_by_sku[sku]
            exists = db.exec(select(AssetEntry).where(AssetEntry.asset_id == asset.id, AssetEntry.quantity == qty,
                                      AssetEntry.supplier == supplier, AssetEntry.office == asset.office)).first()
            if not exists:
                db.add(AssetEntry(asset_id=asset.id, quantity=qty, supplier=supplier, office=asset.office, user_uuid=user_uuid))
                counts["entries"] += 1
        exits = [
            ("NXV-IT-001", 2, "allocation", "Employee 1"),
            ("NXV-IT-001", 1, "consumption", None),
            ("NXV-PER-001", 3, "allocation", "Employee 2"),
        ]
        for sku, qty, kind, assigned in exits:
            asset = asset_by_sku[sku]
            exists = db.exec(select(AssetExit).where(AssetExit.asset_id == asset.id, AssetExit.quantity == qty,
                                     AssetExit.exit_type == kind, AssetExit.assigned_to == assigned,
                                     AssetExit.office == asset.office)).first()
            if not exists:
                db.add(AssetExit(asset_id=asset.id, quantity=qty, exit_type=kind, assigned_to=assigned,
                                 office=asset.office, user_uuid=user_uuid))
                counts["exits"] += 1
        db.commit()
    return counts
