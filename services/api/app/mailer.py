"""Transactional email adapter (AUTH-03).

`EmailSender` is the interface the password-reset flow depends on. `ResendEmailSender` is the real
provider (Resend REST API over the standard library, no extra dependency). `DisabledEmailSender`
is used when no API key is configured, so the API still starts and answers generically.

Secrets: the API key is read from the environment only and never appears in logs or exceptions.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger("nexova.mailer")

DEFAULT_RESEND_API_BASE_URL = "https://api.resend.com"
# Resend's shared testing sender: works without a custom domain, but only delivers to the
# address that owns the Resend account (other recipients get HTTP 403).
DEFAULT_EMAIL_FROM = "Nexova <onboarding@resend.dev>"


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    html: str
    text: str


class EmailDeliveryError(Exception):
    """Delivery failed. `status` is the provider HTTP status (0 = unreachable); never contains secrets."""

    def __init__(self, status: int, reason: str):
        super().__init__(f"email delivery failed (status={status}, reason={reason})")
        self.status = status
        self.reason = reason


class EmailSender(Protocol):
    provider: str

    def send(self, message: EmailMessage) -> str:
        """Send the message and return the provider message id, or raise EmailDeliveryError."""


class DisabledEmailSender:
    provider = "disabled"

    def send(self, message: EmailMessage) -> str:
        raise EmailDeliveryError(0, "not_configured")


class ResendEmailSender:
    provider = "resend"

    def __init__(self, api_key: str, sender: str, base_url: str = DEFAULT_RESEND_API_BASE_URL, timeout: float = 10.0):
        self._api_key = api_key
        self._sender = sender
        self._url = f"{base_url.rstrip('/')}/emails"
        self._timeout = timeout

    def send(self, message: EmailMessage) -> str:
        body = json.dumps({
            "from": self._sender,
            "to": [message.to],
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
        }).encode()
        request = urllib.request.Request(self._url, data=body, method="POST", headers={
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Resend rejects requests without a User-Agent (Cloudflare error 1010).
            "User-Agent": "nexova-api/0.2",
        })
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:  # noqa: S310 (fixed https URL by default)
                payload = json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            raise EmailDeliveryError(error.code, _provider_error_name(error)) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise EmailDeliveryError(0, "unreachable") from None
        except ValueError:
            raise EmailDeliveryError(200, "invalid_response") from None
        message_id = payload.get("id") if isinstance(payload, dict) else None
        if not isinstance(message_id, str) or not message_id:
            raise EmailDeliveryError(200, "missing_message_id")
        return message_id


def _provider_error_name(error: urllib.error.HTTPError) -> str:
    """Resend error bodies carry a machine-readable `name` (e.g. validation_error); keep only that."""
    try:
        name = json.loads(error.read() or b"{}").get("name")
    except (ValueError, AttributeError, OSError):
        name = None
    return name if isinstance(name, str) and name.replace("_", "").isalnum() else "http_error"


def get_email_sender() -> EmailSender:
    """FastAPI dependency: Resend when RESEND_API_KEY is set, otherwise disabled (logged, no secrets)."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        return DisabledEmailSender()
    return ResendEmailSender(
        api_key=api_key,
        sender=os.environ.get("EMAIL_FROM", "").strip() or DEFAULT_EMAIL_FROM,
        base_url=os.environ.get("RESEND_API_BASE_URL", "").strip() or DEFAULT_RESEND_API_BASE_URL,
    )
