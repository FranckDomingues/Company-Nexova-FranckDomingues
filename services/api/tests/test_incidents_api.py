"""HTTP regression tests for Nexova incidents."""

import csv
import io
import logging
import unittest
from unittest import mock

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / "incidents-analysis" / "incidents-nexova.csv"


class TestIncidentsAPI(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def upload(self, name="incidents.csv", content=None):
        if content is None:
            content = SAMPLE.read_bytes()

        return self.client.post(
            "/api/incidents/analyze",
            files={"file": (name, content, "text/csv")},
        )

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_official_analysis(self):
        response = self.upload()

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertEqual(data["total"], 100)
        self.assertEqual(data["valid"], 96)
        self.assertEqual(data["invalid"], 4)
        self.assertEqual(
            data["metrics"]["average_satisfaction"], "3.84"
        )
        self.assertEqual(len(data["analysis_id"]), 32)

    def test_export(self):
        analysis = self.upload().json()

        response = self.client.get(
            "/api/incidents/results/export",
            params={"analysis_id": analysis["analysis_id"]},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "text/csv", response.headers["content-type"]
        )

        rows = list(csv.DictReader(io.StringIO(response.text)))
        values = {
            row["metric"]: row["value"] for row in rows
        }

        self.assertEqual(len(rows), 30)
        self.assertEqual(values["valid_records"], "96")
        self.assertEqual(
            values["average_satisfaction"], "3.84"
        )
        self.assertNotIn("@", response.text)

    def test_empty_file(self):
        response = self.upload(content=b"")
        self.assertEqual(response.status_code, 400)

    def test_upload_limit_returns_413(self):
        with mock.patch("app.api.routes.incidents.MAX_UPLOAD_BYTES", 3):
            response = self.upload(content=b"four")
        self.assertEqual(response.status_code, 413)
        self.assertIn("error", response.json())

    def test_wrong_extension(self):
        response = self.upload(name="incidents.txt")
        self.assertEqual(response.status_code, 400)

    def test_invalid_headers(self):
        response = self.upload(
            content=b"wrong,headers\n1,2\n"
        )
        self.assertEqual(response.status_code, 400)

    def test_validation_error_is_structured_and_sanitized(self):
        # Missing required parameters exercise FastAPI's request validation.
        missing = self.client.get("/api/incidents/results/export")
        self.assertEqual(missing.status_code, 422)
        self.assertEqual(missing.json(), {"error": {"code": "validation_error", "message": "Request validation failed."}})
        self.assertNotIn("CANARY_PRIVATE_VALUE", missing.text)

    def test_unhandled_server_error_is_structured_and_sanitized(self):
        client = TestClient(app, raise_server_exceptions=False)
        with mock.patch("app.api.routes.incidents.analyzer.analyze", side_effect=RuntimeError("CANARY_SECRET /private/path")):
            response = client.post(
                "/api/incidents/analyze",
                files={"file": ("incidents.csv", b"not empty", "text/csv")},
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"error": {"code": "internal_error", "message": "An unexpected error occurred. Please try again."}})
        self.assertNotIn("CANARY_SECRET", response.text)
        self.assertNotIn("Traceback", response.text)
        self.assertNotIn("/private/path", response.text)

    def test_upload_io_error_is_safe_500(self):
        with mock.patch("app.api.routes.incidents.Path.open", side_effect=OSError("CANARY_PRIVATE_PATH")):
            response = self.upload(content=b"some bytes")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"error": {"code": "http_500", "message": "The request could not be completed."}})
        self.assertNotIn("CANARY_PRIVATE_PATH", response.text)
        self.assertNotIn("Traceback", response.text)

    def test_unknown_analysis(self):
        response = self.client.get(
            "/api/incidents/results/export",
            params={"analysis_id": "not-found"},
        )
        self.assertEqual(response.status_code, 404)

    def test_two_analyses_keep_separate_results(self):
        first = self.upload().json()

        header = (
            "ticket_id,date,client_company,category,"
            "description,agent_id,status,customer_email,"
            "satisfaction_score\n"
        )

        second = self.upload(
            content=header.encode("utf-8")
        ).json()

        self.assertNotEqual(
            first["analysis_id"], second["analysis_id"]
        )

        first_export = self.client.get(
            "/api/incidents/results/export",
            params={"analysis_id": first["analysis_id"]},
        )

        second_export = self.client.get(
            "/api/incidents/results/export",
            params={"analysis_id": second["analysis_id"]},
        )

        self.assertEqual(first_export.status_code, 200)
        self.assertEqual(second_export.status_code, 200)

        self.assertIn(
            "valid_records,96", first_export.text
        )
        self.assertIn(
            "valid_records,0", second_export.text
        )


if __name__ == "__main__":
    unittest.main()
