"""Optional, privacy-minimized HTTP notification for aggregate incident analysis."""

from __future__ import annotations

import ipaddress
import json
import logging
import os
from dataclasses import dataclass
from enum import Enum
from typing import Protocol
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger("nexova.notifications.incident_webhook")

# Keep individual connection/read phases bounded, and avoid unbounded wall-clock waits.
CONNECT_TIMEOUT_SECONDS = 2.0
READ_TIMEOUT_SECONDS = 3.0
WRITE_TIMEOUT_SECONDS = 3.0
POOL_TIMEOUT_SECONDS = 1.0
MAX_RESPONSE_BYTES = 16 * 1024


class DeliveryCategory(str, Enum):
    DISABLED = "disabled"
    DELIVERED = "delivered"
    CONFIGURATION_ERROR = "configuration_error"
    CONNECTION_ERROR = "connection_error"
    TIMEOUT = "timeout"
    REMOTE_REJECTED = "remote_rejected"
    REMOTE_UNAVAILABLE = "remote_unavailable"
    INVALID_RESPONSE = "invalid_response"


@dataclass(frozen=True)
class DeliveryResult:
    category: DeliveryCategory
    status_code: int | None = None

    @property
    def delivered(self) -> bool:
        return self.category is DeliveryCategory.DELIVERED


@dataclass(frozen=True)
class IncidentResultNotification:
    """Outbound contract containing aggregate metrics only; never source rows."""

    analysis_id: str
    total_records: int
    valid_records: int
    invalid_records: int
    average_satisfaction: str | None

    def to_payload(self) -> dict[str, object]:
        return {
            "event": "incident_analysis.completed",
            "analysis_id": self.analysis_id,
            "metrics": {
                "total_records": self.total_records,
                "valid_records": self.valid_records,
                "invalid_records": self.invalid_records,
                "average_satisfaction": self.average_satisfaction,
            },
        }


class IncidentNotificationPort(Protocol):
    def deliver(self, notification: IncidentResultNotification) -> DeliveryResult:
        """Deliver one aggregate notification; implementations must not retry implicitly."""


def _valid_endpoint(endpoint: str | None) -> bool:
    if not endpoint:
        return False
    try:
        parsed = urlsplit(endpoint)
        # Ensure HTTPX can construct the URL before attempting a network call.
        httpx.URL(endpoint)
        hostname = parsed.hostname
        if not hostname:
            return False
        is_loopback = hostname.lower() == "localhost"
        try:
            address = ipaddress.ip_address(hostname)
            is_loopback = address.is_loopback
        except ValueError:
            address = None
        # Local HTTP is allowed only on loopback for deterministic development
        # receivers. Remote endpoints must use HTTPS; literal non-public IPs are
        # rejected to avoid accidental disclosure to private infrastructure.
        if parsed.scheme == "http":
            if not is_loopback:
                return False
        elif parsed.scheme == "https":
            if address is not None and not address.is_global:
                return False
        else:
            return False
        # Accessing port validates that any explicit port is numeric and in range.
        _ = parsed.port
        return (
            parsed.username is None
            and parsed.password is None
            and not parsed.fragment
        )
    except (ValueError, UnicodeError, httpx.InvalidURL):
        return False


class WebhookConfiguration:
    """Environment-backed optional webhook settings, evaluated per request."""

    @staticmethod
    def endpoint() -> str | None:
        return os.getenv("NEXOVA_INCIDENT_WEBHOOK_URL")

    @staticmethod
    def enabled() -> bool:
        return os.getenv("NEXOVA_INCIDENT_WEBHOOK_ENABLED", "false").strip().lower() in {
            "1", "true", "yes", "on"
        }


class HttpIncidentWebhookAdapter:
    """One-shot HTTPX POST adapter with bounded timeouts and safe errors."""

    def deliver(self, notification: IncidentResultNotification) -> DeliveryResult:
        if not WebhookConfiguration.enabled():
            return DeliveryResult(DeliveryCategory.DISABLED)

        endpoint = WebhookConfiguration.endpoint()
        if not _valid_endpoint(endpoint):
            return self._log_result(DeliveryCategory.CONFIGURATION_ERROR)

        payload = json.dumps(
            notification.to_payload(), separators=(",", ":"), ensure_ascii=True
        ).encode("utf-8")
        timeout = httpx.Timeout(
            connect=CONNECT_TIMEOUT_SECONDS,
            read=READ_TIMEOUT_SECONDS,
            write=WRITE_TIMEOUT_SECONDS,
            pool=POOL_TIMEOUT_SECONDS,
        )
        # Deliberately no retries: a timeout after server acceptance is ambiguous,
        # and repeating this side-effecting request could duplicate notification.
        try:
            with httpx.Client(timeout=timeout, follow_redirects=False) as client:
                with client.stream(
                    "POST",
                    endpoint,
                    content=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Idempotency-Key": notification.analysis_id,
                    },
                ) as response:
                    if response.status_code < 200 or response.status_code >= 300:
                        category = (
                            DeliveryCategory.REMOTE_REJECTED
                            if response.status_code < 500
                            else DeliveryCategory.REMOTE_UNAVAILABLE
                        )
                        return self._log_result(category, response.status_code)
                    if response.status_code == 204:
                        return DeliveryResult(DeliveryCategory.DELIVERED, response.status_code)

                    if response.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
                        return self._log_result(
                            DeliveryCategory.INVALID_RESPONSE, response.status_code
                        )
                    raw_body = bytearray()
                    try:
                        for chunk in response.iter_bytes():
                            raw_body.extend(chunk)
                            if len(raw_body) > MAX_RESPONSE_BYTES:
                                return self._log_result(
                                    DeliveryCategory.INVALID_RESPONSE, response.status_code
                                )
                        decoded = json.loads(raw_body)
                    except (ValueError, UnicodeDecodeError):
                        return self._log_result(
                            DeliveryCategory.INVALID_RESPONSE, response.status_code
                        )
                    if not isinstance(decoded, dict) or decoded.get("accepted") is not True:
                        return self._log_result(
                            DeliveryCategory.INVALID_RESPONSE, response.status_code
                        )
                    return DeliveryResult(DeliveryCategory.DELIVERED, response.status_code)
        except httpx.TimeoutException:
            return self._log_result(DeliveryCategory.TIMEOUT)
        except httpx.ConnectError:
            return self._log_result(DeliveryCategory.CONNECTION_ERROR)
        except httpx.TransportError:
            return self._log_result(DeliveryCategory.CONNECTION_ERROR)

    @staticmethod
    def _log_result(
        category: DeliveryCategory, status_code: int | None = None
    ) -> DeliveryResult:
        # Never log exception text, request URL, response body, token or payload.
        logger.warning(
            "Optional incident webhook delivery failed category=%s status=%s",
            category.value,
            status_code if status_code is not None else "none",
        )
        return DeliveryResult(category, status_code)
