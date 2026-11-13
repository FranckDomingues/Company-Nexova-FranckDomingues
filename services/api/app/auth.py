"""Stateless bearer-token authentication backed by TinyDB users."""

import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.hash import bcrypt, bcrypt_sha256
from tinydb import Query
from tinydb.table import Table

from app.database import get_users_table

ALGORITHM = "HS256"
TOKEN_URL = "/auth/login"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=TOKEN_URL, auto_error=False)
UserTable = Annotated[Table, Depends(get_users_table)]


def _secret_key() -> str:
    secret = os.environ.get("JWT_SECRET_KEY", "")
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET_KEY must be set to at least 32 characters")
    return secret


def token_expiry_minutes() -> int:
    try:
        minutes = int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    except ValueError as exc:
        raise RuntimeError("JWT_ACCESS_TOKEN_EXPIRE_MINUTES must be an integer") from exc
    if minutes < 1:
        raise RuntimeError("JWT_ACCESS_TOKEN_EXPIRE_MINUTES must be positive")
    return minutes


def hash_password(password: str) -> str:
    # bcrypt truncates input after 72 bytes; the SHA-256 pre-hash variant keeps
    # the API's documented 128-character password limit meaningful.
    return bcrypt_sha256.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        if password_hash.startswith("$bcrypt-sha256$"):
            return bcrypt_sha256.verify(password, password_hash)
        # Preserve authentication for credentials created by earlier releases.
        return bcrypt.verify(password, password_hash)
    except (TypeError, ValueError):
        return False


def create_access_token(user_id: int | str, expires_delta: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    expires = now + (expires_delta or timedelta(minutes=token_expiry_minutes()))
    claims = {"sub": str(user_id), "iat": now, "exp": expires}
    return jwt.encode(claims, _secret_key(), algorithm=ALGORITHM)


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)], table: UserTable
) -> dict:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired bearer token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise unauthorized
    try:
        claims = jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
        # Tokens minted by this API always expire. Reject externally-signed tokens
        # that omit exp rather than accidentally accepting an unbounded credential.
        if "exp" not in claims:
            raise unauthorized
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject.isdecimal():
            raise unauthorized
        user_id = int(subject)
    except (JWTError, RuntimeError, ValueError):
        raise unauthorized
    user = table.get(doc_id=user_id)
    if user is None or user.get("id") != user_id or not user.get("is_active", False):
        raise unauthorized
    return dict(user)


def require_roles(*roles: str):
    def dependency(user: Annotated[dict, Depends(get_current_user)]) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return dependency


CurrentUser = Annotated[dict, Depends(get_current_user)]
AdminUser = Annotated[dict, Depends(require_roles("admin"))]
ManagerOrAdminUser = Annotated[dict, Depends(require_roles("admin", "manager"))]


def find_user_by_email(table: Table, email: str) -> dict | None:
    record = table.get(Query().email == email.strip().casefold())
    return dict(record) if record is not None else None
