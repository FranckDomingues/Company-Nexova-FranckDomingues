"""Idempotent development seed; requires an existing TinyDB user with UUID."""

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlmodel import Session

from app.database import _database_for, resolve_database_path
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
ENTRIES = [
    ("NXV-IT-001", 10, "TechDistrib Valencia S.L."),
    ("NXV-IT-001", 5, "TechDistrib Valencia S.L."),
    ("NXV-PER-001", 20, "Office Depot Valencia"),
    ("NXV-IT-002", 8, "TechDistrib Miami"),
]
EXITS = [
    ("NXV-IT-001", 2, "allocation", "Employee 1"),
    ("NXV-IT-001", 1, "consumption", None),
    ("NXV-PER-001", 3, "allocation", "Employee 2"),
]


@dataclass(frozen=True)
class SeedCatalog:
    assets: list[tuple[str, str, str, str]]
    entries: list[tuple[str, int, str]]
    exits: list[tuple[str, int, str, str | None]]


CANONICAL_CATALOG = SeedCatalog(ASSETS, ENTRIES, EXITS)


def _temporary_roots() -> list[Path]:
    roots = {Path(tempfile.gettempdir()).resolve(), Path("/tmp").resolve()}
    return [root for root in roots if root.exists()]


def _persistent_seed_owner_uuid() -> str:
    """Return the canonical seed owner from the configured, persistent TinyDB only.

    The owner is never injectable: a temporary/test identity store must not become
    the persistent owner of canonical demonstration records.
    """
    path = resolve_database_path().resolve()
    if any(path.is_relative_to(root) for root in _temporary_roots()):
        raise RuntimeError("Refusing canonical seed: the TinyDB identity store is temporary, not persistent")
    users = _database_for(str(path)).table("users").all()
    valid = [str(u.get("user_uuid")) for u in users if u.get("is_active") and u.get("user_uuid")]
    if not valid:
        raise RuntimeError("Create an authorized TinyDB user first; inventory seed does not create identities")
    return valid[0]


def apply_seed_catalog(db: Session, catalog: SeedCatalog, user_uuid: str) -> dict[str, int]:
    """Idempotently add the catalog's rows inside the caller's transaction (no commit)."""
    counts = {"assets": 0, "entries": 0, "exits": 0}
    for name, sku, category, office in catalog.assets:
        if db.exec(select(Asset).where(Asset.sku == sku)).first() is None:
            db.add(Asset(name=name, sku=sku, category=category, office=office))
            db.flush()
            counts["assets"] += 1
    skus = [a[1] for a in catalog.assets]
    asset_by_sku = {a.sku: a for a in db.scalars(select(Asset).where(Asset.sku.in_(skus))).all()}
    for sku, qty, supplier in catalog.entries:
        asset = asset_by_sku[sku]
        exists = db.exec(select(AssetEntry).where(AssetEntry.asset_id == asset.id, AssetEntry.quantity == qty,
                                  AssetEntry.supplier == supplier, AssetEntry.office == asset.office)).first()
        if not exists:
            db.add(AssetEntry(asset_id=asset.id, quantity=qty, supplier=supplier, office=asset.office, user_uuid=user_uuid))
            counts["entries"] += 1
    for sku, qty, kind, assigned in catalog.exits:
        asset = asset_by_sku[sku]
        exists = db.exec(select(AssetExit).where(AssetExit.asset_id == asset.id, AssetExit.quantity == qty,
                                 AssetExit.exit_type == kind, AssetExit.assigned_to == assigned,
                                 AssetExit.office == asset.office)).first()
        if not exists:
            db.add(AssetExit(asset_id=asset.id, quantity=qty, exit_type=kind, assigned_to=assigned,
                             office=asset.office, user_uuid=user_uuid))
            counts["exits"] += 1
    db.flush()
    return counts


def seed_inventory(session: Session | None = None) -> dict[str, int]:
    """Seed the canonical catalog owned by the persistent TinyDB user.

    With ``session`` the caller owns the transaction (commit/rollback); otherwise the
    seed commits its own transaction.
    """
    _assert_seed_database_is_approved()
    user_uuid = _persistent_seed_owner_uuid()
    if session is not None:
        return apply_seed_catalog(session, CANONICAL_CATALOG, user_uuid)
    with Session(get_engine()) as db:
        counts = apply_seed_catalog(db, CANONICAL_CATALOG, user_uuid)
        db.commit()
    return counts


if __name__ == "__main__":
    print(seed_inventory())
