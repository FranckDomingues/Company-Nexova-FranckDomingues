"""FastAPI application for Nexova's centralized incident manager."""
import logging
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import create_schema, get_session
from app.models import Branch, Incident, IncidentCategory, IncidentCreate, IncidentOrigin, IncidentStatus, IncidentStatusUpdate
from app.orm import IncidentRecord, to_incident

logger = logging.getLogger("nexova.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_schema()
    yield


app = FastAPI(title="Nexova Centralized Incident Manager", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500", "http://localhost:5500",
        "http://127.0.0.1:5501", "http://localhost:5501",
        "http://127.0.0.1:8765", "http://localhost:8765",
        "http://127.0.0.1:8766", "http://localhost:8766",
        "http://127.0.0.1:8767", "http://localhost:8767",
        "http://127.0.0.1:8768", "http://localhost:8768",
    ],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    fields = {}
    for error in exc.errors():
        field = str(error.get("loc", ["request"])[-1])
        fields[field] = "This value is required or invalid."
    return JSONResponse(status_code=400, content={"message": "Please check the highlighted fields.", "field_errors": fields})


@app.exception_handler(Exception)
async def generic_error_handler(_: Request, exc: Exception):
    logger.error("Unhandled API error: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"message": "An unexpected server error occurred. Please try again."})


def _safe_db(action):
    try:
        return action()
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        logger.error("Database operation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Unable to complete the request. Please try again.") from None


@app.post("/api/incidents", response_model=Incident, status_code=201)
def create_incident(payload: IncidentCreate, session: Session = Depends(get_session)):
    def operation():
        now = datetime.now(timezone.utc)
        record = IncidentRecord(**payload.model_dump(mode="json"), created_at=now, updated_at=now)
        session.add(record)
        session.commit()
        session.refresh(record)
        return to_incident(record)
    return _safe_db(operation)


@app.get("/api/incidents", response_model=list[Incident])
def list_incidents(
    status: IncidentStatus | None = None, origin: IncidentOrigin | None = None,
    branch: Branch | None = None, category: IncidentCategory | None = None,
    session: Session = Depends(get_session),
):
    def operation():
        query = select(IncidentRecord).order_by(IncidentRecord.created_at.desc(), IncidentRecord.id.desc())
        for field, value in (("status", status), ("origin", origin), ("branch", branch), ("category", category)):
            if value is not None:
                query = query.where(getattr(IncidentRecord, field) == value.value)
        return [to_incident(record) for record in session.scalars(query).all()]
    return _safe_db(operation)


@app.get("/api/incidents/summary")
def incident_summary(session: Session = Depends(get_session)):
    def operation():
        records = session.scalars(select(IncidentRecord)).all()
        def counts(field, enum_type):
            totals = Counter(getattr(record, field) for record in records)
            return {item.value: totals.get(item.value, 0) for item in enum_type}
        return {"total": len(records), "by_status": counts("status", IncidentStatus),
                "by_category": counts("category", IncidentCategory), "by_origin": counts("origin", IncidentOrigin),
                "by_branch": counts("branch", Branch)}
    return _safe_db(operation)


@app.get("/api/incidents/{incident_id}", response_model=Incident)
def get_incident(incident_id: int, session: Session = Depends(get_session)):
    def operation():
        record = session.get(IncidentRecord, incident_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Incident not found.")
        return to_incident(record)
    return _safe_db(operation)


_TRANSITIONS = {"open": {"in_progress", "discarded"}, "in_progress": {"resolved", "discarded"}, "resolved": set(), "discarded": set()}


@app.patch("/api/incidents/{incident_id}/status", response_model=Incident)
def update_status(incident_id: int, payload: IncidentStatusUpdate, session: Session = Depends(get_session)):
    def operation():
        record = session.get(IncidentRecord, incident_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Incident not found.")
        if payload.status.value not in _TRANSITIONS[record.status]:
            raise HTTPException(status_code=400, detail="This status change is not allowed. Choose a valid next step.")
        from datetime import datetime, timezone
        record.status = payload.status.value
        record.updated_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(record)
        return to_incident(record)
    return _safe_db(operation)


@app.get("/health")
def health_check():
    return {"status": "ok"}
