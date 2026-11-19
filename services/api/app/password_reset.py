"""Password recovery and change (AUTH-03): domain logic, independent of FastAPI routing.

Token design (the assignment allows "a random string stored in the database"):
  - 256-bit token from `secrets.token_urlsafe(32)`; only its SHA-256 is stored (a DB leak does not
    yield usable links; high entropy makes a slow hash unnecessary).
  - Row in TinyDB `password_resets`: token_hash, user_id, created_at, expires_at, used_at.
  - Valid only if: the hash exists, `used_at` is empty, now < expires_at, and the token was issued
    after the user's `password_changed_at` (so a later reset/change revokes older links).
  - Consumption and the password update happen under one process lock, the token is marked used in
    the same critical section, and a failure restores the previous password (compensation), so two
    concurrent requests with the same token cannot both succeed.

Concurrency scope: TinyDB is a single JSON file owned by one API process; the lock serialises all
password writes in that process. A multi-process deployment would need a DB-level lock or a
transactional store (documented in docs/evidence/AUTH-03-SECURITY-REPORT.md).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from tinydb import Query
from tinydb.table import Table

from app.auth import _secret_key, hash_password, verify_password

logger = logging.getLogger("nexova.auth.password")

RESET_PATH = "/backoffice/reset-password"
DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5500"
_PASSWORD_LOCK = threading.Lock()


def now() -> datetime:
    """Single clock for the module (tests monkeypatch it to simulate expiry)."""
    return datetime.now(timezone.utc)


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        value = int(raw) if raw else default
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def reset_token_minutes() -> int:
    """PASSWORD_RESET_TOKEN_EXPIRE_MINUTES, 15–60 as the assignment requires (default 30)."""
    return _int_env("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", 30, 15, 60)


def max_requests_per_email() -> int:
    return _int_env("PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR", 3, 1, 100)


def max_requests_per_ip() -> int:
    return _int_env("PASSWORD_RESET_MAX_PER_IP_PER_HOUR", 20, 1, 1000)


def frontend_reset_url(token: str) -> str:
    base = (os.environ.get("FRONTEND_BASE_URL", "").strip() or DEFAULT_FRONTEND_BASE_URL).rstrip("/")
    return f"{base}{RESET_PATH}?{urlencode({'token': token})}"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def email_fingerprint(email: str) -> str:
    """Keyed HMAC of the normalised email: lets audit/rate-limit group requests without storing addresses."""
    key = hashlib.sha256(f"nexova-password-audit:{_secret_key()}".encode()).digest()
    return hmac.new(key, email.strip().casefold().encode(), hashlib.sha256).hexdigest()


def _iso(moment: datetime) -> str:
    return moment.isoformat()


def _parse(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# ----------------------------------------------------------------------------------- audit (EXTRA-03)
@dataclass(frozen=True)
class RequestMeta:
    ip: str | None
    user_agent: str | None


def record_event(audit: Table, event: str, outcome: str, meta: RequestMeta | None = None, *,
                 user_id: int | None = None, email_hmac: str | None = None, **extra: object) -> None:
    """Append an audit event. Never pass passwords, raw tokens, token hashes or raw email addresses."""
    audit.insert({
        "event": event,
        "outcome": outcome,
        "at": _iso(now()),
        "ip": meta.ip if meta else None,
        "user_agent": (meta.user_agent or "")[:200] if meta else None,
        "user_id": user_id,
        "email_hmac": email_hmac,
        **extra,
    })
    logger.info("password_event event=%s outcome=%s user_id=%s", event, outcome, user_id)


# ------------------------------------------------------------------------------ rate limit (EXTRA-02)
_COUNTED_OUTCOMES = {"email_queued", "unknown_email", "inactive_account"}


def _recent_requests(audit: Table, field: str, value: str) -> int:
    since = now() - timedelta(hours=1)
    entry = Query()
    rows = audit.search((entry.event == "reset_requested") & (entry[field] == value))
    return sum(1 for row in rows if row.get("outcome") in _COUNTED_OUTCOMES and (_parse(row.get("at")) or since) > since)


def ip_rate_limited(audit: Table, ip: str | None) -> bool:
    return bool(ip) and _recent_requests(audit, "ip", ip) >= max_requests_per_ip()


def email_rate_limited(audit: Table, email_hmac: str) -> bool:
    return _recent_requests(audit, "email_hmac", email_hmac) >= max_requests_per_email()


# --------------------------------------------------------------------------------------- reset flow
def issue_reset_token(resets: Table, user_id: int) -> str:
    """Create and persist a new single-use token; returns the raw token (only for the email link)."""
    token = secrets.token_urlsafe(32)
    issued = now()
    resets.insert({
        "token_hash": hash_token(token),
        "user_id": user_id,
        "created_at": _iso(issued),
        "expires_at": _iso(issued + timedelta(minutes=reset_token_minutes())),
        "used_at": None,
    })
    return token


class ResetTokenError(Exception):
    """Invalid, expired or already-used token. `reason` is for audit only, never returned to clients."""

    def __init__(self, reason: str, user_id: int | None = None):
        super().__init__(reason)
        self.reason = reason
        self.user_id = user_id


def _revoke_user_tokens(resets: Table, user_id: int, at: str) -> None:
    entry = Query()
    resets.update({"used_at": at}, (entry.user_id == user_id) & (entry.used_at == None))  # noqa: E711


def _set_password(users: Table, resets: Table, user: dict, new_password: str, *, consume_hash: str | None) -> None:
    """Atomic unit (caller holds the lock): new hash + password_changed_at, then mark tokens used.

    If marking the token(s) fails, the previous password fields are restored before re-raising,
    so the database never ends with a changed password and a still-usable token.
    """
    changed_at = _iso(now())
    previous = {key: user.get(key) for key in ("hashed_password", "password_changed_at")}
    users.update({"hashed_password": hash_password(new_password), "password_changed_at": changed_at}, doc_ids=[user["id"]])
    try:
        if consume_hash is not None:
            resets.update({"used_at": changed_at}, Query().token_hash == consume_hash)
        _revoke_user_tokens(resets, user["id"], changed_at)
    except Exception:
        users.update(previous, doc_ids=[user["id"]])
        raise


def reset_password(users: Table, resets: Table, token: str, new_password: str) -> int:
    """Validate and consume `token`, set the new password. Returns the user id or raises ResetTokenError."""
    token_hash = hash_token(token)
    with _PASSWORD_LOCK:
        row = resets.get(Query().token_hash == token_hash)
        if row is None:
            raise ResetTokenError("unknown")
        user_id = row.get("user_id")
        if row.get("used_at"):
            raise ResetTokenError("used", user_id)
        expires_at = _parse(row.get("expires_at"))
        if expires_at is None or now() >= expires_at:
            raise ResetTokenError("expired", user_id)
        user = users.get(doc_id=user_id) if isinstance(user_id, int) else None
        if user is None or user.get("id") != user_id or not user.get("is_active", False):
            raise ResetTokenError("no_active_user", user_id)
        created_at = _parse(row.get("created_at"))
        changed_at = _parse(user.get("password_changed_at"))
        if changed_at and (created_at is None or created_at < changed_at):
            raise ResetTokenError("superseded", user_id)
        _set_password(users, resets, dict(user), new_password, consume_hash=token_hash)
        return user_id


class CurrentPasswordError(Exception):
    pass


def change_password(users: Table, resets: Table, user_id: int, current_password: str, new_password: str) -> None:
    """Verify the current password, then set the new one (also revokes outstanding reset links)."""
    with _PASSWORD_LOCK:
        user = users.get(doc_id=user_id)
        if user is None or not verify_password(current_password, user.get("hashed_password", "")):
            raise CurrentPasswordError()
        _set_password(users, resets, dict(user), new_password, consume_hash=None)
