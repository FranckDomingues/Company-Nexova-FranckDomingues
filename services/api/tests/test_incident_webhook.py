"""Deterministic local-server tests for the optional outbound HTTP adapter."""

from __future__ import annotations

import json
import logging
import socket
import ssl
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from app.notifications import incident_webhook as webhook
from app.notifications.incident_webhook import (
    DeliveryCategory,
    HttpIncidentWebhookAdapter,
    IncidentResultNotification,
)


NOTIFICATION = IncidentResultNotification(
    analysis_id="a" * 32,
    total_records=100,
    valid_records=96,
    invalid_records=4,
    average_satisfaction="3.84",
)


class LocalReceiver(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class WebhookAdapterTests(unittest.TestCase):
    def setUp(self):
        self.requests: list[tuple[dict[str, str], bytes]] = []
        self.status = 200
        self.body = b'{"accepted":true}'
        self.content_type = "application/json"
        self.delay = 0
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                owner.requests.append((dict(self.headers.items()), body))
                if owner.delay:
                    import time
                    time.sleep(owner.delay)
                self.send_response(owner.status)
                self.send_header("Content-Type", owner.content_type)
                self.send_header("Content-Length", str(len(owner.body)))
                self.end_headers()
                try:
                    self.wfile.write(owner.body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def log_message(self, format, *args):
                return

        self.server = LocalReceiver(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.endpoint = f"http://127.0.0.1:{self.server.server_port}/notify"
        self.env = mock.patch.dict(
            "os.environ",
            {
                "NEXOVA_INCIDENT_WEBHOOK_ENABLED": "true",
                "NEXOVA_INCIDENT_WEBHOOK_URL": self.endpoint,
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self._stop_server)
        self.adapter = HttpIncidentWebhookAdapter()

    def _stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_success_posts_only_aggregated_data(self):
        result = self.adapter.deliver(NOTIFICATION)
        self.assertEqual(result.category, DeliveryCategory.DELIVERED)
        self.assertEqual(len(self.requests), 1)
        headers, body = self.requests[0]
        self.assertEqual(headers["Idempotency-Key"], "a" * 32)
        payload = json.loads(body)
        self.assertEqual(payload["metrics"]["total_records"], 100)
        self.assertNotIn("customer_email", body.decode())
        self.assertNotIn("description", body.decode())

    def test_no_delivery_when_disabled(self):
        with mock.patch.dict("os.environ", {"NEXOVA_INCIDENT_WEBHOOK_ENABLED": "false"}):
            result = self.adapter.deliver(NOTIFICATION)
        self.assertEqual(result.category, DeliveryCategory.DISABLED)
        self.assertEqual(self.requests, [])

    def test_missing_or_invalid_configuration_is_safe(self):
        with mock.patch.dict("os.environ", {"NEXOVA_INCIDENT_WEBHOOK_URL": ""}):
            self.assertEqual(self.adapter.deliver(NOTIFICATION).category, DeliveryCategory.CONFIGURATION_ERROR)
        for endpoint in (
            "ftp://example.com/notify",
            "http://example.com/notify",
            "https://user:CANARY_SECRET@example.com/hook",
            "http://192.168.1.5/hook",
            "https://example.com:invalid/hook",
        ):
            with self.subTest(endpoint=endpoint), mock.patch.dict("os.environ", {"NEXOVA_INCIDENT_WEBHOOK_URL": endpoint}):
                self.assertEqual(self.adapter.deliver(NOTIFICATION).category, DeliveryCategory.CONFIGURATION_ERROR)
        self.assertEqual(self.requests, [])

    def test_connection_refused(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            unused_port = sock.getsockname()[1]
        with mock.patch.dict("os.environ", {"NEXOVA_INCIDENT_WEBHOOK_URL": f"http://127.0.0.1:{unused_port}/"}):
            result = self.adapter.deliver(NOTIFICATION)
        self.assertEqual(result.category, DeliveryCategory.CONNECTION_ERROR)

    def test_connect_timeout_during_local_tls_handshake(self):
        accepted = threading.Event()
        stalled = socket.socket()
        stalled.bind(("127.0.0.1", 0))
        stalled.listen(1)
        port = stalled.getsockname()[1]

        def accept_without_tls():
            conn, _ = stalled.accept()
            accepted.set()
            try:
                threading.Event().wait(0.5)
                conn.close()
            finally:
                stalled.close()

        thread = threading.Thread(target=accept_without_tls, daemon=True)
        thread.start()
        with mock.patch.dict("os.environ", {"NEXOVA_INCIDENT_WEBHOOK_URL": f"https://localhost:{port}/"}), mock.patch.object(webhook, "CONNECT_TIMEOUT_SECONDS", 0.1):
            result = self.adapter.deliver(NOTIFICATION)
        thread.join(timeout=1)
        self.assertTrue(accepted.is_set())
        self.assertEqual(result.category, DeliveryCategory.TIMEOUT)

    def test_read_timeout(self):
        self.delay = 0.5
        with mock.patch.object(webhook, "READ_TIMEOUT_SECONDS", 0.05):
            result = self.adapter.deliver(NOTIFICATION)
        self.assertEqual(result.category, DeliveryCategory.TIMEOUT)
        self.assertEqual(len(self.requests), 1)

    def test_http_error_statuses_are_classified_and_never_retried(self):
        for status, expected in (
            (400, DeliveryCategory.REMOTE_REJECTED),
            (429, DeliveryCategory.REMOTE_REJECTED),
            (500, DeliveryCategory.REMOTE_UNAVAILABLE),
            (503, DeliveryCategory.REMOTE_UNAVAILABLE),
        ):
            with self.subTest(status=status):
                self.status = status
                self.requests.clear()
                result = self.adapter.deliver(NOTIFICATION)
                self.assertEqual(result.category, expected)
                self.assertEqual(len(self.requests), 1)

    def test_unexpected_and_malformed_success_responses(self):
        self.content_type = "text/plain"
        self.body = b"CANARY_RESPONSE_BODY"
        self.assertEqual(self.adapter.deliver(NOTIFICATION).category, DeliveryCategory.INVALID_RESPONSE)
        self.content_type = "application/json"
        self.body = b"{bad-json"
        self.assertEqual(self.adapter.deliver(NOTIFICATION).category, DeliveryCategory.INVALID_RESPONSE)
        self.body = b'{"accepted":false}'
        self.assertEqual(self.adapter.deliver(NOTIFICATION).category, DeliveryCategory.INVALID_RESPONSE)

    def test_oversized_response_is_rejected(self):
        self.body = b" " * (webhook.MAX_RESPONSE_BYTES + 1)
        self.assertEqual(self.adapter.deliver(NOTIFICATION).category, DeliveryCategory.INVALID_RESPONSE)

    def test_no_content_success_is_accepted(self):
        self.status = 204
        self.body = b""
        self.assertEqual(self.adapter.deliver(NOTIFICATION).category, DeliveryCategory.DELIVERED)

    def test_api_response_does_not_leak_webhook_canary(self):
        self.status = 500
        self.body = b"CANARY_WEBHOOK_RESPONSE"
        with mock.patch.dict(
            "os.environ",
            {
                "NEXOVA_INCIDENT_WEBHOOK_ENABLED": "true",
                "NEXOVA_INCIDENT_WEBHOOK_URL": self.endpoint,
            },
        ):
            from fastapi.testclient import TestClient
            from app.main import app
            sample = (
                __import__("pathlib").Path(__file__).resolve().parents[3]
                / "incidents-analysis"
                / "incidents-nexova.csv"
            ).read_bytes()
            response = TestClient(app).post(
                "/api/incidents/analyze",
                files={"file": ("incidents.csv", sample, "text/csv")},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notification"], "failed")
        self.assertNotIn("CANARY_WEBHOOK_RESPONSE", response.text)
        self.assertNotIn(self.endpoint, response.text)

    def test_logs_do_not_leak_canary_url_or_response_body(self):
        self.status = 500
        self.body = b"CANARY_SECRET CANARY_PERSONAL_DATA"
        canary_url = "http://127.0.0.1:%d/CANARY_PATH" % self.server.server_port
        with mock.patch.dict("os.environ", {"NEXOVA_INCIDENT_WEBHOOK_URL": canary_url}), self.assertLogs(webhook.logger, logging.WARNING) as captured:
            self.adapter.deliver(NOTIFICATION)
        rendered = " ".join(captured.output)
        for secret in ("CANARY_SECRET", "CANARY_PERSONAL_DATA", "CANARY_PATH", "127.0.0.1"):
            self.assertNotIn(secret, rendered)


if __name__ == "__main__":
    unittest.main()
