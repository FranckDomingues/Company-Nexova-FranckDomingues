"""SQLModel persistence declarations for Nexova's asset inventory."""

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, DateTime, Integer, String, text
from sqlmodel import Field, Relationship, SQLModel


class Asset(SQLModel, table=True):
    __tablename__ = "inventory_assets"
    __table_args__ = (
        CheckConstraint(
            "category IN ('hardware', 'peripherals', 'office_supplies', 'training_materials')",
            name="ck_inventory_assets_category",
        ),
        CheckConstraint("office IN ('Valencia', 'Miami')", name="ck_inventory_assets_office"),
    )

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(sa_type=String(200), nullable=False)
    sku: str = Field(sa_type=String(80), nullable=False, unique=True, index=True)
    category: str = Field(sa_type=String(40), nullable=False)
    office: str = Field(sa_type=String(40), nullable=False)
    entries: list["AssetEntry"] = Relationship(back_populates="asset")
    exits: list["AssetExit"] = Relationship(back_populates="asset")


class AssetEntry(SQLModel, table=True):
    __tablename__ = "inventory_asset_entries"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_inventory_asset_entries_quantity_positive"),
        CheckConstraint("office IN ('Valencia', 'Miami')", name="ck_inventory_asset_entries_office"),
    )

    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="inventory_assets.id", index=True)
    quantity: int = Field(sa_type=Integer, nullable=False)
    supplier: str = Field(sa_type=String(200), nullable=False)
    office: str = Field(sa_type=String(40), nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
    )
    user_uuid: str = Field(sa_type=String(36), nullable=False, index=True)
    asset: Asset = Relationship(back_populates="entries")


class AssetExit(SQLModel, table=True):
    __tablename__ = "inventory_asset_exits"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_inventory_asset_exits_quantity_positive"),
        CheckConstraint("office IN ('Valencia', 'Miami')", name="ck_inventory_asset_exits_office"),
        CheckConstraint("exit_type IN ('allocation', 'consumption')", name="ck_inventory_asset_exits_type"),
        CheckConstraint(
            "(exit_type = 'allocation' AND assigned_to IS NOT NULL AND length(trim(assigned_to)) > 0) "
            "OR (exit_type = 'consumption' AND assigned_to IS NULL)",
            name="ck_inventory_asset_exits_assignment",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="inventory_assets.id", index=True)
    quantity: int = Field(sa_type=Integer, nullable=False)
    exit_type: str = Field(sa_type=String(20), nullable=False)
    assigned_to: str | None = Field(default=None, sa_type=String(200))
    office: str = Field(sa_type=String(40), nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
    )
    user_uuid: str = Field(sa_type=String(36), nullable=False, index=True)
    asset: Asset = Relationship(back_populates="exits")
