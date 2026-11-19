"""AUTH-03: forgot/reset/change password, email adapter, security properties and extras.

Isolated like tests/test_auth.py: temporary TinyDB, test-only JWT secret, overridden tables.
The email provider is replaced by an in-memory outbox, except in the Resend adapter tests, which
run the real adapter against a local HTTP server that mimics the Resend API.
"""

import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app import password_reset as service
from app.database import (
    _database_for, get_password_audit_table, get_password_resets_table, get_profiles_table,
    get_suppliers_table, get_users_table,
)
from app.email_templates import password_reset_email
from app.mailer import DisabledEmailSender, EmailDeliveryError, EmailMessage, ResendEmailSender, get_email_sender
from app.main import app

EMAIL = "reset.user@example.com"
OLD = "old-password-123"
NEW = "brand-new-password-456"
GENERIC = {"detail": "If that address is registered, a password reset link has been sent."}


class Outbox:
    provider = "test-outbox"

    def __init__(self):
        self.messages: list[EmailMessage] = []
        self.fail_with: EmailDeliveryError | None = None

    def send(self, message: EmailMessage) -> str:
        if self.fail_with:
            raise self.fail_with
        self.messages.append(message)
        return f"msg_{len(self.messages)}"


@pytest.fixture
def outbox():
    return Outbox()


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "isolated-password-test.json"


@pytest.fixture
def client(db_path, monkeypatch, outbox):
    monkeypatch.setenv("SUPPLIER_DB_PATH", str(db_path))
    monkeypatch.setenv("JWT_SECRET_KEY", "isolated-test-secret-that-is-long-enough")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://frontend.test")
    for name in ("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR",
                 "PASSWORD_RESET_MAX_PER_IP_PER_HOUR", "RESEND_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    _database_for.cache_clear()
    database = lambda: _database_for(str(db_path))  # noqa: E731
    app.dependency_overrides.update({
        get_users_table: lambda: database().table("users"),
        get_profiles_table: lambda: database().table("profiles"),
        get_suppliers_table: lambda: database().table("suppliers"),
        get_password_resets_table: lambda: database().table("password_resets"),
        get_password_audit_table: lambda: database().table("password_audit_events"),
        get_email_sender: lambda: outbox,
    })
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    _database_for.cache_clear()


def table(name: str):
    return app.dependency_overrides[{"users": get_users_table, "resets": get_password_resets_table,
                                     "audit": get_password_audit_table}[name]]()


def signup(client, email=EMAIL, password=OLD):
    assert client.post("/users", json={"email": email, "password": password}).status_code == 201


def login(client, email=EMAIL, password=OLD):
    return client.post("/auth/login", data={"username": email, "password": password})


def bearer(client, email=EMAIL, password=OLD):
    response = login(client, email, password)
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def token_from(message: EmailMessage) -> str:
    link = next(word for word in message.text.split() if word.startswith("http://frontend.test/"))
    return parse_qs(urlparse(link).query)["token"][0]


def request_token(client, outbox, email=EMAIL) -> str:
    assert client.post("/auth/forgot-password", json={"email": email}).json() == GENERIC
    return token_from(outbox.messages[-1])


def shift_clock(monkeypatch, **delta):
    base = datetime.now(timezone.utc)
    monkeypatch.setattr(service, "now", lambda: base + timedelta(**delta))


# ------------------------------------------------------------------------------- forgot-password
def test_forgot_password_registered_email_sends_reset_link_and_stores_only_a_hash(client, outbox, db_path):
    signup(client)
    response = client.post("/auth/forgot-password", json={"email": "  Reset.User@Example.com "})
    assert response.status_code == 200 and response.json() == GENERIC
    assert len(outbox.messages) == 1
    message = outbox.messages[0]
    assert message.to == EMAIL and message.subject == "Restablece tu contraseña de Nexova"
    token = token_from(message)
    assert len(token) >= 43  # 256-bit secrets.token_urlsafe(32)
    link = f"http://frontend.test/backoffice/reset-password?token={token}"
    assert link in message.text and link in message.html
    rows = table("resets").all()
    assert len(rows) == 1 and rows[0]["token_hash"] == service.hash_token(token) and rows[0]["used_at"] is None
    assert token not in db_path.read_text()  # the raw token is never persisted
    assert token not in response.text


def test_forgot_password_unknown_email_is_indistinguishable(client, outbox):
    signup(client)
    known = client.post("/auth/forgot-password", json={"email": EMAIL})
    unknown = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json()) == (200, GENERIC)
    strip = lambda h: {k: v for k, v in h.items() if k.lower() not in {"date", "content-length"}}  # noqa: E731
    assert strip(known.headers) == strip(unknown.headers)
    assert len(outbox.messages) == 1  # only the registered address got an email
    assert [e["outcome"] for e in table("audit").all() if e["event"] == "reset_requested"] == ["email_queued", "unknown_email"]


def test_forgot_password_inactive_account_gets_generic_response_and_no_email(client, outbox):
    signup(client)
    users = table("users")
    users.update({"is_active": False}, doc_ids=[users.all()[0].doc_id])
    assert client.post("/auth/forgot-password", json={"email": EMAIL}).json() == GENERIC
    assert outbox.messages == []


def test_forgot_password_rejects_malformed_input(client):
    assert client.post("/auth/forgot-password", json={"email": "not-an-email"}).status_code == 422
    assert client.post("/auth/forgot-password", json={}).status_code == 422
    assert client.post("/auth/forgot-password", json={"email": EMAIL, "extra": 1}).status_code == 422


def test_email_delivery_failure_is_generic_for_the_client_and_audited(client, outbox, caplog):
    signup(client)
    outbox.fail_with = EmailDeliveryError(403, "validation_error")
    with caplog.at_level(logging.DEBUG):
        response = client.post("/auth/forgot-password", json={"email": EMAIL})
    assert response.status_code == 200 and response.json() == GENERIC
    failure = [e for e in table("audit").all() if e["event"] == "reset_email"]
    assert failure and failure[0]["outcome"] == "delivery_failed" and failure[0]["provider_status"] == 403
    assert EMAIL not in caplog.text


def test_unconfigured_provider_still_answers_generically(client, monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert isinstance(get_email_sender(), DisabledEmailSender)
    app.dependency_overrides.pop(get_email_sender)
    signup(client)
    assert client.post("/auth/forgot-password", json={"email": EMAIL}).json() == GENERIC
    outcomes = [e["outcome"] for e in table("audit").all() if e["event"] == "reset_email"]
    assert outcomes == ["delivery_failed"]


# -------------------------------------------------------------------------------- reset-password
def test_reset_password_updates_hash_invalidates_token_and_swaps_credentials(client, outbox):
    signup(client)
    before = table("users").all()[0]["hashed_password"]
    token = request_token(client, outbox)
    response = client.post("/auth/reset-password", json={"token": token, "new_password": NEW})
    assert response.status_code == 200 and response.json() == {"detail": "Password updated"}
    user = table("users").all()[0]
    assert user["hashed_password"] != before and user["hashed_password"].startswith("$2") and NEW not in json.dumps(user)
    assert table("resets").all()[0]["used_at"] is not None
    assert login(client, password=OLD).status_code == 401
    assert login(client, password=NEW).status_code == 200


def test_used_token_cannot_be_reused(client, outbox):
    signup(client)
    token = request_token(client, outbox)
    assert client.post("/auth/reset-password", json={"token": token, "new_password": NEW}).status_code == 200
    again = client.post("/auth/reset-password", json={"token": token, "new_password": "third-password-789"})
    assert again.status_code == 400 and again.json() == {"detail": "Invalid or expired reset token"}
    assert login(client, password=NEW).status_code == 200


@pytest.mark.parametrize("minutes", [15, 30, 60])
def test_token_expires_after_the_configured_window(client, outbox, monkeypatch, minutes):
    monkeypatch.setenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", str(minutes))
    signup(client)
    token = request_token(client, outbox)
    row = table("resets").all()[0]
    window = datetime.fromisoformat(row["expires_at"]) - datetime.fromisoformat(row["created_at"])
    assert window == timedelta(minutes=minutes)
    shift_clock(monkeypatch, minutes=minutes, seconds=1)
    expired = client.post("/auth/reset-password", json={"token": token, "new_password": NEW})
    assert expired.status_code == 400
    assert login(client, password=OLD).status_code == 200  # nothing changed
    assert [e["outcome"] for e in table("audit").all() if e["event"] == "reset_rejected"] == ["expired"]


def test_token_still_valid_just_before_expiry(client, outbox, monkeypatch):
    signup(client)
    token = request_token(client, outbox)
    shift_clock(monkeypatch, minutes=29, seconds=50)
    assert client.post("/auth/reset-password", json={"token": token, "new_password": NEW}).status_code == 200


@pytest.mark.parametrize("value", ["10", "61", "abc"])
def test_expiry_configuration_is_bounded_to_15_60_minutes(monkeypatch, value):
    monkeypatch.setenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", value)
    with pytest.raises(RuntimeError):
        service.reset_token_minutes()


def test_unknown_or_forged_token_is_rejected(client):
    for token in ["", "x" * 600]:
        assert client.post("/auth/reset-password", json={"token": token, "new_password": NEW}).status_code == 422
    assert client.post("/auth/reset-password", json={"token": "forged-token-value", "new_password": NEW}).status_code == 400


def test_weak_new_password_is_rejected_without_consuming_the_token(client, outbox):
    signup(client)
    token = request_token(client, outbox)
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "short"}).status_code == 422
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "x" * 129}).status_code == 422
    assert client.post("/auth/reset-password", json={"token": token, "new_password": NEW}).status_code == 200


def test_a_successful_reset_revokes_every_other_outstanding_link(client, outbox):
    signup(client)
    first = request_token(client, outbox)
    second = request_token(client, outbox)
    assert client.post("/auth/reset-password", json={"token": second, "new_password": NEW}).status_code == 200
    assert client.post("/auth/reset-password", json={"token": first, "new_password": "another-password-1"}).status_code == 400


def test_concurrent_reuse_of_one_token_succeeds_exactly_once(client, outbox, monkeypatch):
    signup(client)
    token = request_token(client, outbox)
    real_hash = service.hash_password
    monkeypatch.setattr(service, "hash_password", lambda value: (time.sleep(0.05), real_hash(value))[1])  # widen the race
    users, resets = table("users"), table("resets")
    barrier = threading.Barrier(8)
    results: list[str] = []

    def attempt(index: int) -> None:
        barrier.wait()
        try:
            service.reset_password(users, resets, token, f"concurrent-password-{index}")
            results.append("ok")
        except service.ResetTokenError:
            results.append("rejected")

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == ["ok"] + ["rejected"] * 7


def test_password_update_and_token_consumption_are_atomic(client, outbox, monkeypatch):
    signup(client)
    token = request_token(client, outbox)

    def broken(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(service, "_revoke_user_tokens", broken)
    with pytest.raises(OSError):
        service.reset_password(table("users"), table("resets"), token, NEW)
    assert login(client, password=OLD).status_code == 200  # previous password restored
    assert login(client, password=NEW).status_code == 401
    monkeypatch.undo()


# ------------------------------------------------------------------------------- change-password
def test_change_password_requires_authentication(client):
    body = {"current_password": OLD, "new_password": NEW}
    assert client.post("/auth/change-password", json=body).status_code == 401
    assert client.post("/auth/change-password", json=body, headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_change_password_rejects_wrong_current_password_with_400(client):
    signup(client)
    response = client.post("/auth/change-password", json={"current_password": "wrong-password-0", "new_password": NEW}, headers=bearer(client))
    assert response.status_code == 400 and response.json() == {"detail": "Current password is incorrect"}
    assert login(client, password=OLD).status_code == 200
    assert [e["outcome"] for e in table("audit").all()] == ["wrong_current_password"]


def test_change_password_success_swaps_credentials_and_revokes_reset_links(client, outbox):
    signup(client)
    pending = request_token(client, outbox)
    response = client.post("/auth/change-password", json={"current_password": OLD, "new_password": NEW}, headers=bearer(client))
    assert response.status_code == 200 and response.json() == {"detail": "Password updated"}
    assert login(client, password=OLD).status_code == 401
    assert login(client, password=NEW).status_code == 200
    assert client.post("/auth/reset-password", json={"token": pending, "new_password": "other-password-1"}).status_code == 400


def test_change_password_enforces_policy_and_difference(client):
    signup(client)
    auth = bearer(client)
    assert client.post("/auth/change-password", json={"current_password": OLD, "new_password": "short"}, headers=auth).status_code == 422
    same = client.post("/auth/change-password", json={"current_password": OLD, "new_password": OLD}, headers=auth)
    assert same.status_code == 400


# ----------------------------------------------------------------------------- rate limit (EXTRA-02)
def test_per_email_rate_limit_is_silent_and_applies_to_unknown_emails_too(client, outbox, monkeypatch):
    monkeypatch.setenv("PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR", "2")
    signup(client)
    for email in (EMAIL, "ghost@example.com"):
        responses = [client.post("/auth/forgot-password", json={"email": email}) for _ in range(3)]
        assert all(r.status_code == 200 and r.json() == GENERIC for r in responses)
    assert len(outbox.messages) == 2  # third request for the registered address sent nothing
    outcomes = [e["outcome"] for e in table("audit").all() if e["event"] == "reset_requested"]
    assert outcomes.count("rate_limited_email") == 2
    shift_clock(monkeypatch, hours=1, minutes=1)
    client.post("/auth/forgot-password", json={"email": EMAIL})
    assert len(outbox.messages) == 3  # window expired


def test_per_ip_rate_limit_returns_429_regardless_of_email(client, monkeypatch):
    monkeypatch.setenv("PASSWORD_RESET_MAX_PER_IP_PER_HOUR", "3")
    for index in range(3):
        assert client.post("/auth/forgot-password", json={"email": f"user{index}@example.com"}).status_code == 200
    limited = client.post("/auth/forgot-password", json={"email": "anyone@example.com"})
    assert limited.status_code == 429 and limited.headers["Retry-After"] == "3600"


# ----------------------------------------------------------------------------------- audit (EXTRA-03)
def test_audit_events_have_metadata_and_never_secrets(client, outbox, db_path):
    signup(client)
    token = request_token(client, outbox)
    client.post("/auth/reset-password", json={"token": token, "new_password": NEW})
    client.post("/auth/reset-password", json={"token": token, "new_password": NEW})
    events = table("audit").all()
    assert [(e["event"], e["outcome"]) for e in events] == [
        ("reset_requested", "email_queued"), ("reset_email", "sent"),
        ("reset_completed", "password_updated"), ("reset_rejected", "used")]
    for event in events:
        assert datetime.fromisoformat(event["at"]).tzinfo is not None
        assert event["ip"] == "testclient" and "user_agent" in event
    dump = json.dumps(events)
    for secret in (token, service.hash_token(token), NEW, OLD, EMAIL):
        assert secret not in dump
    assert events[1]["provider_message_id"] == "msg_1"


def test_logs_never_contain_tokens_passwords_or_emails(client, outbox, caplog):
    with caplog.at_level(logging.DEBUG):
        signup(client)
        token = request_token(client, outbox)
        client.post("/auth/reset-password", json={"token": token, "new_password": NEW})
        client.post("/auth/change-password", json={"current_password": NEW, "new_password": "final-password-999"}, headers=bearer(client, password=NEW))
    for secret in (token, NEW, OLD, "final-password-999", EMAIL):
        assert secret not in caplog.text
    assert "password_event" in caplog.text


# ---------------------------------------------------------------------- Resend adapter + template
class _FakeResend(BaseHTTPRequestHandler):
    requests: list = []
    reply: tuple = (200, {"id": "re_test_123"})

    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        type(self).requests.append({"path": self.path, "headers": dict(self.headers), "body": body})
        status, payload = type(self).reply
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def log_message(self, *_args):
        pass


@pytest.fixture
def fake_resend():
    _FakeResend.requests = []
    server = HTTPServer(("127.0.0.1", 0), _FakeResend)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_resend_adapter_sends_the_documented_request(fake_resend):
    _FakeResend.reply = (200, {"id": "re_test_123"})
    sender = ResendEmailSender(api_key="re_dummy_key_for_tests", sender="Nexova <onboarding@resend.dev>", base_url=fake_resend)
    message = password_reset_email(EMAIL, "http://frontend.test/backoffice/reset-password?token=abc", 30)
    assert sender.send(message) == "re_test_123"
    sent = _FakeResend.requests[0]
    assert sent["path"] == "/emails"
    assert sent["headers"]["Authorization"] == "Bearer re_dummy_key_for_tests"
    assert sent["headers"]["User-Agent"].startswith("nexova-api/")
    assert sent["body"] == {"from": "Nexova <onboarding@resend.dev>", "to": [EMAIL], "subject": message.subject,
                            "html": message.html, "text": message.text}


def test_resend_adapter_errors_are_typed_and_never_carry_the_key(fake_resend):
    _FakeResend.reply = (403, {"statusCode": 403, "name": "validation_error", "message": "You can only send testing emails to your own email address"})
    sender = ResendEmailSender(api_key="re_dummy_key_for_tests", sender="x@example.com", base_url=fake_resend)
    with pytest.raises(EmailDeliveryError) as raised:
        sender.send(EmailMessage(to=EMAIL, subject="s", html="h", text="t"))
    assert (raised.value.status, raised.value.reason) == (403, "validation_error")
    assert "re_dummy_key_for_tests" not in str(raised.value)
    unreachable = ResendEmailSender(api_key="k", sender="x@example.com", base_url="http://127.0.0.1:9", timeout=1)
    with pytest.raises(EmailDeliveryError) as offline:
        unreachable.send(EmailMessage(to=EMAIL, subject="s", html="h", text="t"))
    assert offline.value.status == 0


def test_provider_selection_from_environment(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_dummy_key_for_tests")
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    sender = get_email_sender()
    assert isinstance(sender, ResendEmailSender) and sender._sender == "Nexova <onboarding@resend.dev>"
    monkeypatch.setenv("RESEND_API_KEY", "   ")
    assert isinstance(get_email_sender(), DisabledEmailSender)


def test_reset_email_is_responsive_html_with_plain_text_fallback():
    url = "http://frontend.test/backoffice/reset-password?token=a&b=<x>"
    message = password_reset_email(EMAIL, url, 30)
    assert 'name="viewport"' in message.html and "max-width:560px" in message.html
    assert 'href="http://frontend.test/backoffice/reset-password?token=a&amp;b=&lt;x&gt;"' in message.html
    assert "<x>" not in message.html  # escaped
    assert url in message.text and "30 minutos" in message.text and "<" not in message.text.replace(url, "")
