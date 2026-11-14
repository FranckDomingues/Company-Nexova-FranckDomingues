"""Nexova inventory API; TinyDB remains the sole authentication source."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.auth import CurrentUser
from app.inventory_models import Asset, AssetEntry, AssetExit
from app.inventory_schemas import (
    AssetCreate, AssetEntryCreate, AssetEntryResponse, AssetExitCreate,
    AssetExitResponse, AssetResponse, InventoryOrderResponse,
)
from app.sql_database import get_db

router = APIRouter(prefix="/inventory", tags=["Inventory"])
DbSession = Annotated[Session, Depends(get_db)]


def _stock(db: Session, asset_id: int) -> int:
    inbound = db.scalar(select(func.coalesce(func.sum(AssetEntry.quantity), 0)).where(AssetEntry.asset_id == asset_id)) or 0
    outbound = db.scalar(select(func.coalesce(func.sum(AssetExit.quantity), 0)).where(AssetExit.asset_id == asset_id)) or 0
    return int(inbound) - int(outbound)


def _asset_response(db: Session, asset: Asset) -> AssetResponse:
    return AssetResponse(id=asset.id, name=asset.name, sku=asset.sku, category=asset.category,
                         office=asset.office, current_stock=_stock(db, asset.id))


def _user_uuid(user: dict) -> str:
    value = user.get("user_uuid")
    if not value:
        raise HTTPException(status_code=401, detail="Authenticated TinyDB user has no UUID")
    return str(value)


@router.get("/products", response_model=list[AssetResponse])
def list_assets(db: DbSession):
    assets = db.scalars(select(Asset).order_by(Asset.id)).all()
    if not assets:
        return []
    inbound = {row[0]: row[1] for row in db.exec(select(AssetEntry.asset_id, func.sum(AssetEntry.quantity)).group_by(AssetEntry.asset_id)).all()}
    outbound = {row[0]: row[1] for row in db.exec(select(AssetExit.asset_id, func.sum(AssetExit.quantity)).group_by(AssetExit.asset_id)).all()}
    return [AssetResponse(id=a.id, name=a.name, sku=a.sku, category=a.category, office=a.office,
                          current_stock=int(inbound.get(a.id) or 0) - int(outbound.get(a.id) or 0)) for a in assets]


@router.post("/products", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(payload: AssetCreate, db: DbSession, user: CurrentUser):
    _user_uuid(user)
    asset = Asset(**payload.model_dump())
    db.add(asset)
    try:
        db.commit()
        db.refresh(asset)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="SKU already exists") from None
    return _asset_response(db, asset)


@router.get("/products/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: int, db: DbSession):
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_response(db, asset)


@router.post("/orders/inbound", response_model=AssetEntryResponse, status_code=status.HTTP_201_CREATED)
def create_entry(payload: AssetEntryCreate, db: DbSession, user: CurrentUser):
    user_uuid = _user_uuid(user)
    asset = db.get(Asset, payload.asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if payload.office != asset.office:
        raise HTTPException(status_code=422, detail="Order office must match asset office")
    entry = AssetEntry(**payload.model_dump(), user_uuid=user_uuid)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return AssetEntryResponse.model_validate(entry, from_attributes=True)


@router.post("/orders/outbound", response_model=AssetExitResponse, status_code=status.HTTP_201_CREATED)
def create_exit(payload: AssetExitCreate, db: DbSession, user: CurrentUser):
    user_uuid = _user_uuid(user)
    try:
        # Lock the parent asset row to serialize all exits for this asset in PostgreSQL.
        # The lock persists until commit/rollback; no write occurs before stock validation.
        stmt = select(Asset).where(Asset.id == payload.asset_id).with_for_update()
        asset = db.exec(stmt).first()
        if asset is not None and not isinstance(asset, Asset):
            asset = asset[0]
        if asset is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        if payload.office != asset.office:
            raise HTTPException(status_code=422, detail="Order office must match asset office")
        available = _stock(db, asset.id)
        if payload.quantity > available:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for asset '{asset.name}'. Available: {available}, requested: {payload.quantity}.")
        record = AssetExit(**payload.model_dump(), user_uuid=user_uuid)
        db.add(record)
        db.commit()
        db.refresh(record)
        return AssetExitResponse.model_validate(record, from_attributes=True)
    except Exception:
        db.rollback()
        raise


@router.get("/orders", response_model=list[InventoryOrderResponse])
def list_orders(db: DbSession):
    # Two joined queries avoid per-order asset lookups (N+1).
    entries = db.exec(select(AssetEntry, Asset.name, Asset.sku).join(Asset, Asset.id == AssetEntry.asset_id)).all()
    exits = db.exec(select(AssetExit, Asset.name, Asset.sku).join(Asset, Asset.id == AssetExit.asset_id)).all()
    result = [InventoryOrderResponse(kind="inbound", id=o.id, asset_id=o.asset_id, asset_name=name,
             asset_sku=sku, quantity=o.quantity, office=o.office, created_at=o.created_at,
             user_uuid=o.user_uuid, supplier=o.supplier) for o, name, sku in entries]
    result.extend(InventoryOrderResponse(kind="outbound", id=o.id, asset_id=o.asset_id, asset_name=name,
             asset_sku=sku, quantity=o.quantity, office=o.office, created_at=o.created_at,
             user_uuid=o.user_uuid, exit_type=o.exit_type, assigned_to=o.assigned_to) for o, name, sku in exits)
    return sorted(result, key=lambda item: (item.created_at, item.kind, item.id))
