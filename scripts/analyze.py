"""Nexova incident CSV analyzer."""

import argparse
import csv
import re
from collections import Counter
from datetime import date
from pathlib import Path

CATEGORIES = (
    "TECHNICAL", "BILLING", "ACCESS",
    "HR_QUERY", "COMPLAINT",
)
STATUSES = ("OPEN", "CLOSED", "DISCARDED")

FIELDS = (
    "ticket_id", "date", "client_company",
    "category", "description", "agent_id",
    "status", "customer_email", "satisfaction_score",
)


def validate(row, seen_ids):
    errors = []
    ticket_id = row["ticket_id"].strip()

    if not re.fullmatch(r"NXV-\d{6}", ticket_id):
        errors.append("Invalid ticket ID")
    elif ticket_id in seen_ids:
        errors.append("Duplicate ticket ID")
    else:
        seen_ids.add(ticket_id)

    try:
        value = row["date"].strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError
        date.fromisoformat(value)
    except ValueError:
        errors.append("Invalid date")

    if not row["client_company"].strip():
        errors.append("Missing client_company")

    if row["category"].strip() not in CATEGORIES:
        errors.append("Invalid or missing category")

    if len(row["description"].strip()) < 5:
        errors.append("Invalid description")

    if not re.fullmatch(r"AGT-\d{2}", row["agent_id"].strip()):
        errors.append("Invalid agent ID")

    status = row["status"].strip()
    if status not in STATUSES:
        errors.append("Invalid status")

    email = row["customer_email"].strip()
    if "@" not in email:
        errors.append("Invalid or missing email")

    score = row["satisfaction_score"].strip()

    if status == "CLOSED" and not score:
        errors.append("Closed ticket, no score")
    elif score:
        if not score.isdigit() or not 1 <= int(score) <= 5:
            errors.append("Invalid satisfaction score")

    return errors


def analyze(path):
    summary = {
        "total": 0,
        "valid": 0,
        "invalid": 0,
        "categories": Counter(),
        "statuses": Counter(),
        "errors": Counter(),
        "scores": Counter(),
    }

    seen_ids = set()

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        if reader.fieldnames != list(FIELDS):
            raise ValueError("Invalid CSV headers")

        for row in reader:
            summary["total"] += 1

            if None in row or any(
                value is None for value in row.values()
            ):
                summary["invalid"] += 1
                summary["errors"]["Malformed row"] += 1
                continue

            errors = validate(row, seen_ids)

            if errors:
                summary["invalid"] += 1
                summary["errors"].update(errors)
                continue

            summary["valid"] += 1
            summary["categories"][row["category"].strip()] += 1

            status = row["status"].strip()
            summary["statuses"][status] += 1

            if status == "CLOSED":
                score = int(row["satisfaction_score"].strip())
                summary["scores"][score] += 1

    return summary


def metrics(summary):
    valid = summary["valid"]
    scores = summary["scores"]
    scored = sum(scores.values())
    average = (
        sum(score * count for score, count in scores.items()) / scored
        if scored else None
    )

    result = [
        ("total_records", summary["total"]),
        ("valid_records", valid),
        ("invalid_records", summary["invalid"]),
    ]

    for reason, count in sorted(summary["errors"].items()):
        result.append((f"invalid:{reason}", count))

    for category in CATEGORIES:
        count = summary["categories"][category]
        result.append((f"category:{category}", count))
        result.append((
            f"category_percentage:{category}",
            f"{count / valid * 100:.1f}" if valid else "N/A",
        ))

    for status in STATUSES:
        count = summary["statuses"][status]
        result.append((f"status:{status}", count))
        result.append((
            f"status_percentage:{status}",
            f"{count / valid * 100:.1f}" if valid else "N/A",
        ))

    result.append(("scored_closed_tickets", scored))
    result.append((
        "average_satisfaction",
        f"{average:.2f}" if average is not None else "N/A",
    ))

    for score in range(1, 6):
        result.append((f"satisfaction_score:{score}", scores[score]))

    return result


def export_csv(result, destination):
    with destination.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["metric", "value"])
        writer.writerows(result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_file", type=Path)
    args = parser.parse_args()

    try:
        summary = analyze(args.csv_file)

        print("=" * 60)
        print("NEXOVA — SUPPORT TICKET ANALYSIS")
        print(f"Source file: {args.csv_file.name}")
        print("=" * 60)

        for name, value in metrics(summary):
            print(f"{name:<38} {value}")

        print("=" * 60)

        answer = input("Export results to CSV? [y / n]: ").strip().lower()

        if answer in {"y", "s"}:
            output = Path("results.csv")
            export_csv(metrics(summary), output)
            print(f"Exported: {output}")

    except (OSError, ValueError, csv.Error) as error:
        parser.exit(1, f"Analysis failed: {type(error).__name__}\n")


if __name__ == "__main__":
    main()
