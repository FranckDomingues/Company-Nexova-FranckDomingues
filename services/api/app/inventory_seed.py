"""Idempotent development seed; requires an existing TinyDB user with UUID."""

import os

from sqlalchemy import select
from sqlmodel import Session

from app.database import get_users_table
from app.inventory_models import Asset, AssetEntry, AssetExit
from app.sql_database import get_engine

ASSETS = [
    ("Portátil 14\" Business", "NXV-IT-001", "hardware", "Valencia"),
    ("Portátil 14\" Business", "NXV-IT-002", "hardware", "Miami"),
    ("Ratón ergonómico", "NXV-PER-001", "peripherals", "Valencia"),
    ("Hub USB-C", "NXV-PER-002", "peripherals", "Miami"),
    ("Resma de papel A4", "NXV-OFF-001", "office_supplies", "Valencia"),
    ("Cuaderno de formación en liderazgo", "NXV-TRN-001", "training_materials", "Valencia"),
]


def seed_inventory() -> dict[str, int]:
    if os.environ.get("INVENTORY_SEED_ENV", "development") != "development":
        raise RuntimeError("Inventory seed is permitted only with INVENTORY_SEED_ENV=development")
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
                                      AssetEntry.supplier == supplier, AssetEntry.user_uuid == user_uuid)).first()
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
                                     AssetExit.exit_type == kind, AssetExit.user_uuid == user_uuid)).first()
            if not exists:
                db.add(AssetExit(asset_id=asset.id, quantity=qty, exit_type=kind, assigned_to=assigned,
                                 office=asset.office, user_uuid=user_uuid))
                counts["exits"] += 1
        db.commit()
    return counts
