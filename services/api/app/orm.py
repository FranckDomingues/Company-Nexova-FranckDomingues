"""SQLAlchemy mapping and database-level integrity constraints."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models import Branch, IncidentCategory, IncidentOrigin, IncidentStatus


class IncidentRecord(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint("source_key IS NULL OR length(source_key) > 0", name="ck_incident_source_key"),
        CheckConstraint(f"category IN ({', '.join(repr(item.value) for item in IncidentCategory)})", name="ck_incident_category"),
        CheckConstraint(f"status IN ({', '.join(repr(item.value) for item in IncidentStatus)})", name="ck_incident_status"),
        CheckConstraint(f"origin IN ({', '.join(repr(item.value) for item in IncidentOrigin)})", name="ck_incident_origin"),
        CheckConstraint(f"branch IN ({', '.join(repr(item.value) for item in Branch)})", name="ck_incident_branch"),
        CheckConstraint("length(trim(title)) > 0", name="ck_incident_title"),
        CheckConstraint("length(trim(description)) > 0", name="ck_incident_description"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_key: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", index=True)
    origin: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    branch: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.current_timestamp(), onupdate=func.current_timestamp())


def to_incident(record: IncidentRecord):
    from app.models import Incident
    return Incident.model_validate({
        "id": record.id, "title": record.title, "description": record.description,
        "category": record.category, "status": record.status, "origin": record.origin,
        "branch": record.branch, "created_at": record.created_at, "updated_at": record.updated_at,
    })
