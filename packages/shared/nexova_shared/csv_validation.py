"""Privacy-safe validation for historical Nexova support CSV records."""
from __future__ import annotations

import re
from datetime import date
from typing import Mapping

CATEGORIES = ("TECHNICAL", "BILLING", "ACCESS", "HR_QUERY", "COMPLAINT")
STATUSES = ("OPEN", "CLOSED", "DISCARDED")
FIELDS = (
    "ticket_id", "date", "client_company", "category", "description",
    "agent_id", "status", "customer_email", "satisfaction_score",
)


def validate_csv_row(row: Mapping[str, str | None], seen_ids: set[str] | None = None) -> list[str]:
    """Return safe validation errors; never include input values in messages."""
    errors: list[str] = []
    values = {key: (row.get(key) or "").strip() for key in FIELDS}
    ticket_id = values["ticket_id"]
    if not re.fullmatch(r"NXV-\d{6}", ticket_id):
        errors.append("Invalid ticket ID")
    elif seen_ids is not None:
        if ticket_id in seen_ids:
            errors.append("Duplicate ticket ID")
        else:
            seen_ids.add(ticket_id)

    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", values["date"]):
            raise ValueError
        date.fromisoformat(values["date"])
    except ValueError:
        errors.append("Invalid date")

    if not values["client_company"]:
        errors.append("Missing client_company")
    if values["category"] not in CATEGORIES:
        errors.append("Invalid or missing category")
    if len(values["description"]) < 5:
        errors.append("Invalid description")
    if not re.fullmatch(r"AGT-\d{2}", values["agent_id"]):
        errors.append("Invalid agent ID")
    if values["status"] not in STATUSES:
        errors.append("Invalid status")
    if "@" not in values["customer_email"]:
        errors.append("Invalid or missing email")
    score = values["satisfaction_score"]
    if values["status"] == "CLOSED" and not score:
        errors.append("Closed ticket, no score")
    elif score and (not score.isdigit() or not 1 <= int(score) <= 5):
        errors.append("Invalid satisfaction score")
    return errors
