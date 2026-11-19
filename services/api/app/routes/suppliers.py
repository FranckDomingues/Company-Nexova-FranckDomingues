from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from tinydb.table import Table

from app.auth import ManagerOrAdminUser
from app.database import get_suppliers_table
from app.models import (
    Country,
    Supplier,
    SupplierCreate,
    SupplierRateUpdate,
    SupplierStatus,
    SupplierStatusUpdate,
    SupplierCategory,
)

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])
SupplierTable = Annotated[Table, Depends(get_suppliers_table)]


def _as_supplier(document: dict) -> Supplier:
    return Supplier.model_validate(document)


@router.post("", response_model=Supplier, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierCreate, table: SupplierTable, user: ManagerOrAdminUser) -> Supplier:
    document = payload.model_dump(mode="json")
    document["updated_at"] = datetime.now(timezone.utc).isoformat()
    supplier_id = table.insert(document)
    table.update({"id": supplier_id}, doc_ids=[supplier_id])
    return _as_supplier(table.get(doc_id=supplier_id))


@router.get("", response_model=list[Supplier])
def list_suppliers(
    user: ManagerOrAdminUser,
    table: SupplierTable,
    country: Country | None = None,
    category: SupplierCategory | None = Query(default=None),
) -> list[Supplier]:
    suppliers = table.all()
    if country is not None:
        suppliers = [record for record in suppliers if record.get("country") == country.value]
    if category is not None:
        suppliers = [record for record in suppliers if category in record.get("categories", [])]
    return [_as_supplier(record) for record in suppliers]


@router.get("/{supplier_id}", response_model=Supplier)
def get_supplier(supplier_id: int, table: SupplierTable, user: ManagerOrAdminUser) -> Supplier:
    record = table.get(doc_id=supplier_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return _as_supplier(record)


@router.patch("/{supplier_id}/rate", response_model=Supplier)
def update_supplier_rate(
    supplier_id: int, payload: SupplierRateUpdate, table: SupplierTable, user: ManagerOrAdminUser
) -> Supplier:
    if table.get(doc_id=supplier_id) is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    table.update(
        {
            "monthly_rate": payload.monthly_rate,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        doc_ids=[supplier_id],
    )
    return _as_supplier(table.get(doc_id=supplier_id))


@router.patch("/{supplier_id}/status", response_model=Supplier)
def update_supplier_status(
    supplier_id: int, payload: SupplierStatusUpdate, table: SupplierTable, user: ManagerOrAdminUser
) -> Supplier:
    if table.get(doc_id=supplier_id) is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    table.update({"status": payload.status.value}, doc_ids=[supplier_id])
    return _as_supplier(table.get(doc_id=supplier_id))


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(supplier_id: int, table: SupplierTable, user: ManagerOrAdminUser) -> Response:
    if table.get(doc_id=supplier_id) is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    table.remove(doc_ids=[supplier_id])
    return Response(status_code=status.HTTP_204_NO_CONTENT)
