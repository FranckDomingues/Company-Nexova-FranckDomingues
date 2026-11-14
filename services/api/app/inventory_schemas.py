"""Independent API contracts for inventory resources."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Category = Literal["hardware", "peripherals", "office_supplies", "training_materials"]
Office = Literal["Valencia", "Miami"]
ExitType = Literal["allocation", "consumption"]


class AssetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    sku: str = Field(min_length=1, max_length=80)
    category: Category
    office: Office


class AssetResponse(AssetCreate):
    id: int
    current_stock: int


class AssetEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    supplier: str = Field(min_length=1, max_length=200)
    office: Office


class AssetExitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    exit_type: ExitType
    assigned_to: str | None = Field(default=None, max_length=200)
    office: Office

    @model_validator(mode="after")
    def assignment_matches_type(self):
        if self.exit_type == "allocation" and not (self.assigned_to and self.assigned_to.strip()):
            raise ValueError("assigned_to is required for allocation")
        if self.exit_type == "consumption" and self.assigned_to is not None:
            raise ValueError("assigned_to must be null for consumption")
        return self


class AssetEntryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    asset_id: int
    quantity: int
    supplier: str
    office: Office
    created_at: datetime
    user_uuid: str


class AssetExitResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int
    asset_id: int
    quantity: int
    exit_type: ExitType
    assigned_to: str | None
    office: Office
    created_at: datetime
    user_uuid: str


class InventoryOrderResponse(BaseModel):
    kind: Literal["inbound", "outbound"]
    id: int
    asset_id: int
    asset_name: str
    asset_sku: str
    quantity: int
    office: Office
    created_at: datetime
    user_uuid: str
    supplier: str | None = None
    exit_type: ExitType | None = None
    assigned_to: str | None = None
