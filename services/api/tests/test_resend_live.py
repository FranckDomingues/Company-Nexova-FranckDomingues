"""Opt-in checks against the REAL Resend API (no secrets needed): RESEND_LIVE_TESTS=1 pytest -m resend_live.

Uses a deliberately invalid key and Resend's documented test recipient, so nothing is delivered and no
account data is involved. Proves the adapter reaches api.resend.com, passes the User-Agent requirement and
turns provider errors into typed errors that never contain the key (also not in logs).
"""

import logging
import os

import pytest

from app.mailer import EmailDeliveryError, EmailMessage, ResendEmailSender

pytestmark = [
    pytest.mark.resend_live,
    pytest.mark.skipif(os.environ.get("RESEND_LIVE_TESTS") != "1", reason="set RESEND_LIVE_TESTS=1 to call the real Resend API"),
]

FAKE_KEY = "re_invalid_probe_key_0000000000000000"


def test_real_resend_rejects_an_invalid_key_without_leaking_it(caplog):
    sender = ResendEmailSender(api_key=FAKE_KEY, sender="Nexova <onboarding@resend.dev>")
    with caplog.at_level(logging.DEBUG), pytest.raises(EmailDeliveryError) as raised:
        sender.send(EmailMessage(to="delivered@resend.dev", subject="probe", html="<p>probe</p>", text="probe"))
    error = raised.value
    assert error.status in (401, 403) and error.reason != "http_error"  # a real Resend error name, not Cloudflare 1010
    for text in (str(error), repr(error), caplog.text):
        assert FAKE_KEY not in text
