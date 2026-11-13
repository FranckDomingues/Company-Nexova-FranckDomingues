#!/usr/bin/env python3
"""Seed Nexova's authorized historical incident CSV, safely and idempotently."""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import date, datetime, time, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "shared"))
sys.path.insert(0, str(ROOT / "services" / "api"))

from nexova_shared.csv_validation import FIELDS, validate_csv_row  # noqa: E402
from app.database import create_schema, get_session_factory  # noqa: E402
from app.models import Branch, IncidentCategory, IncidentOrigin, IncidentStatus  # noqa: E402
from app.orm import IncidentRecord  # noqa: E402
from sqlalchemy import select  # noqa: E402

CSV_CATEGORY_MAP = {
    "TECHNICAL": IncidentCategory.TECHNICAL_FAILURE.value,
    "BILLING": IncidentCategory.PROCESS_ERROR.value,
    "ACCESS": IncidentCategory.TECHNICAL_FAILURE.value,
    "HR_QUERY": IncidentCategory.PROCESS_ERROR.value,
    "COMPLAINT": IncidentCategory.CLIENT_COMPLAINT.value,
}
CSV_STATUS_MAP = {"OPEN": "open", "CLOSED": "resolved", "DISCARDED": "discarded"}
DEFAULT_CSV = ROOT / "data" / "raw" / "incidents-nexova.csv"


def transform_row(row: dict[str, str], seen_ids: set[str] | None = None) -> tuple[dict | None, list[str]]:
    errors = validate_csv_row(row, seen_ids)
    if errors:
        return None, errors
    description = row["description"].strip()
    title = description[:120].strip()
    if not title:
        return None, ["Missing title after transformation"]
    try:
        category = CSV_CATEGORY_MAP[row["category"].strip()]
        status = CSV_STATUS_MAP[row["status"].strip()]
        created_at = datetime.combine(date.fromisoformat(row["date"].strip()), time.min, tzinfo=timezone.utc)
    except (KeyError, ValueError):
        return None, ["Unable to transform record"]
    return ({
        "source_key": row["ticket_id"].strip(), "title": title,
        "description": description, "category": category, "status": status,
        "origin": IncidentOrigin.CUSTOMER.value, "branch": Branch.CENTRAL.value,
        "created_at": created_at, "updated_at": created_at,
    }, [])


def seed(csv_path: Path = DEFAULT_CSV) -> dict[str, int]:
    # Fail fast before creating a database if the authorized input is missing.
    with csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != list(FIELDS):
            raise ValueError("CSV headers do not match the authorized Nexova incident dataset format.")
        source_rows = list(reader)
    create_schema()
    session_factory = get_session_factory()
    counts = {"inserted": 0, "duplicates": 0, "invalid": 0}
    reasons: dict[str, int] = {}
    seen_ids: set[str] = set()
    with session_factory() as session:
        for row in source_rows:
            if None in row or any(value is None for value in row.values()):
                counts["invalid"] += 1
                reasons["Malformed row"] = reasons.get("Malformed row", 0) + 1
                continue
            values, errors = transform_row(row, seen_ids)
            if errors:
                counts["invalid"] += 1
                for reason in errors:
                    reasons[reason] = reasons.get(reason, 0) + 1
                continue
            if session.scalar(select(IncidentRecord.id).where(IncidentRecord.source_key == values["source_key"])):
                counts["duplicates"] += 1
                continue
            session.add(IncidentRecord(**values))
            counts["inserted"] += 1
        session.commit()
    counts.update({f"invalid_reason:{key}": value for key, value in reasons.items()})
    print(f"Seed complete: inserted={counts['inserted']}, duplicates={counts['duplicates']}, invalid={counts['invalid']}")
    for reason, count in sorted(reasons.items()):
        print(f"  {reason}: {count}")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", nargs="?", type=Path, default=DEFAULT_CSV)
    args = parser.parse_args()
    try:
        seed(args.csv_path)
    except (OSError, ValueError, csv.Error) as exc:
        parser.exit(1, f"Seed failed safely: {type(exc).__name__}: {exc}\n")


if __name__ == "__main__":
    main()
