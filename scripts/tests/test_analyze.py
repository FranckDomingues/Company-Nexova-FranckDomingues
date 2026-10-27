"""Regression tests for Nexova incident analysis."""

import csv
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

SCRIPTS = Path(__file__).resolve().parents[1]
ROOT = SCRIPTS.parent

sys.path.insert(0, str(SCRIPTS))

from analyze import FIELDS, analyze, metrics, validate, export_csv


class TestIncidentAnalyzer(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.source = (
            ROOT / "incidents-analysis" / "incidents-nexova.csv"
        )

        with cls.source.open(
            encoding="utf-8-sig", newline=""
        ) as file:
            rows = list(csv.DictReader(file))

        cls.valid_row = next(
            row.copy()
            for row in rows
            if not validate(row, set())
        )

    def analyze_rows(self, rows):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "sample.csv"

            with path.open(
                "w", encoding="utf-8", newline=""
            ) as file:
                writer = csv.DictWriter(
                    file, fieldnames=FIELDS
                )
                writer.writeheader()
                writer.writerows(rows)

            return analyze(path)

    def test_official_results(self):
        summary = analyze(self.source)
        result = dict(metrics(summary))

        expected = {
            "total_records": 100,
            "valid_records": 96,
            "invalid_records": 4,
            "category:TECHNICAL": 28,
            "category:BILLING": 18,
            "category:ACCESS": 21,
            "category:HR_QUERY": 17,
            "category:COMPLAINT": 12,
            "status:OPEN": 27,
            "status:CLOSED": 56,
            "status:DISCARDED": 13,
            "scored_closed_tickets": 56,
            "average_satisfaction": "3.84",
        }

        for key, value in expected.items():
            with self.subTest(metric=key):
                self.assertEqual(result[key], value)

    def test_invalid_reasons(self):
        summary = analyze(self.source)

        self.assertEqual(
            dict(summary["errors"]),
            {
                "Missing client_company": 1,
                "Invalid or missing category": 1,
                "Invalid or missing email": 1,
                "Closed ticket, no score": 1,
            },
        )

    def test_satisfaction_distribution(self):
        summary = analyze(self.source)

        self.assertEqual(
            dict(summary["scores"]),
            {1: 2, 2: 5, 3: 10, 4: 22, 5: 17},
        )

    def test_invalid_field_cases(self):
        cases = {
            "missing_company": {"client_company": ""},
            "invalid_category": {"category": "UNKNOWN"},
            "invalid_status": {"status": "UNKNOWN"},
            "invalid_date": {"date": "2026-02-30"},
            "invalid_ticket": {"ticket_id": "BAD"},
            "invalid_agent": {"agent_id": "BAD"},
            "short_description": {"description": "abc"},
            "invalid_email": {"customer_email": "invalid"},
            "invalid_score": {"satisfaction_score": "6"},
        }

        for name, changes in cases.items():
            with self.subTest(case=name):
                row = self.valid_row.copy()
                row.update(changes)

                result = self.analyze_rows([row])

                self.assertEqual(result["valid"], 0)
                self.assertEqual(result["invalid"], 1)

    def test_multiple_errors_count_once(self):
        row = self.valid_row.copy()
        row["client_company"] = ""
        row["category"] = "UNKNOWN"

        result = self.analyze_rows([row])

        self.assertEqual(result["invalid"], 1)
        self.assertEqual(sum(result["errors"].values()), 2)

    def test_closed_without_score(self):
        row = self.valid_row.copy()
        row["status"] = "CLOSED"
        row["satisfaction_score"] = ""

        result = self.analyze_rows([row])

        self.assertEqual(result["invalid"], 1)

    def test_duplicate_ticket(self):
        result = self.analyze_rows(
            [self.valid_row, self.valid_row]
        )

        self.assertEqual(result["valid"], 1)
        self.assertEqual(result["invalid"], 1)
        self.assertEqual(
            result["errors"]["Duplicate ticket ID"], 1
        )

    def test_invalid_headers(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "wrong.csv"
            path.write_text(
                "wrong,headers\n1,2\n", encoding="utf-8"
            )

            with self.assertRaises(ValueError):
                analyze(path)

    def test_empty_file(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "empty.csv"
            path.write_text("", encoding="utf-8")

            with self.assertRaises(ValueError):
                analyze(path)

    def test_export(self):
        summary = analyze(self.source)

        with TemporaryDirectory() as directory:
            output = Path(directory) / "results.csv"
            export_csv(metrics(summary), output)

            with output.open(
                encoding="utf-8", newline=""
            ) as file:
                rows = list(csv.DictReader(file))

            values = {
                row["metric"]: row["value"]
                for row in rows
            }

            self.assertEqual(len(rows), 30)
            self.assertEqual(
                values["average_satisfaction"], "3.84"
            )
            self.assertNotIn(
                "@", output.read_text(encoding="utf-8")
            )


if __name__ == "__main__":
    unittest.main()
