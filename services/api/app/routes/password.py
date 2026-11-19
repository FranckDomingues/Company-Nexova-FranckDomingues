"""AUTH-03 endpoints: forgot-password, reset-password, change-password."""

import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr
from tinydb.table import Table

from app import password_reset as service
from app.auth import CurrentUser, UserTable, find_user_by_email
from app.database import get_password_audit_table, get_password_resets_table
from app.email_templates import password_reset_email
from app.mailer import EmailDeliveryError, EmailMessage, EmailSender, get_email_sender
from app.routes.users import Password

logger = logging.getLogger("nexova.auth.password")
router = APIRouter(prefix="/auth", tags=["Authentication"])
ResetTable = Annotated[Table, Depends(get_password_resets_table)]
AuditTable = Annotated[Table, Depends(get_password_audit_table)]
Sender = Annotated[EmailSender, Depends(get_email_sender)]

GENERIC_FORGOT = "If that address is registered, a password reset link has been sent."
INVALID_TOKEN = "Invalid or expired reset token"


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: SecretStr = Field(min_length=1, max_length=512)
    new_password: Password


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: SecretStr = Field(min_length=1, max_length=256)
    new_password: Password


class Detail(BaseModel):
    detail: str


def _meta(request: Request) -> service.RequestMeta:
    # The direct peer address; X-Forwarded-For is not trusted (no proxy is configured in front of the API).
    return service.RequestMeta(ip=request.client.host if request.client else None,
                               user_agent=request.headers.get("user-agent"))


def _deliver(sender: EmailSender, message: EmailMessage, audit: Table, user_id: int, meta: service.RequestMeta) -> None:
    """Background task: send the reset email; failures are audited, never surfaced to the requester."""
    try:
        message_id = sender.send(message)
    except EmailDeliveryError as error:
        service.record_event(audit, "reset_email", "delivery_failed", meta, user_id=user_id,
                             provider=sender.provider, provider_status=error.status, provider_reason=error.reason)
        logger.warning("reset email not delivered provider=%s status=%s reason=%s user_id=%s",
                       sender.provider, error.status, error.reason, user_id)
        return
    except Exception:  # noqa: BLE001 — a provider bug must not crash the worker or leak details
        service.record_event(audit, "reset_email", "delivery_error", meta, user_id=user_id, provider=sender.provider)
        logger.exception("unexpected email provider failure user_id=%s", user_id)
        return
    service.record_event(audit, "reset_email", "sent", meta, user_id=user_id,
                         provider=sender.provider, provider_message_id=message_id)


@router.post("/forgot-password", response_model=Detail,
             responses={429: {"model": Detail, "description": "Too many requests from this client"}})
def forgot_password(payload: ForgotPasswordRequest, request: Request, background: BackgroundTasks,
                    users: UserTable, resets: ResetTable, audit: AuditTable, sender: Sender) -> Detail:
    """Always 200 with the same body for any well-formed email (no account enumeration)."""
    meta = _meta(request)
    email_hmac = service.email_fingerprint(str(payload.email))
    if service.ip_rate_limited(audit, meta.ip):
        service.record_event(audit, "reset_requested", "rate_limited_ip", meta, email_hmac=email_hmac)
        # Applied per client regardless of the email, so it reveals nothing about any account.
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many password reset requests. Try again later.",
                            headers={"Retry-After": "3600"})
    if service.email_rate_limited(audit, email_hmac):
        service.record_event(audit, "reset_requested", "rate_limited_email", meta, email_hmac=email_hmac)
        return Detail(detail=GENERIC_FORGOT)
    user = find_user_by_email(users, str(payload.email))
    if user is None:
        service.record_event(audit, "reset_requested", "unknown_email", meta, email_hmac=email_hmac)
        return Detail(detail=GENERIC_FORGOT)
    if not user.get("is_active", False):
        service.record_event(audit, "reset_requested", "inactive_account", meta, user_id=user["id"], email_hmac=email_hmac)
        return Detail(detail=GENERIC_FORGOT)
    token = service.issue_reset_token(resets, user["id"])
    message = password_reset_email(user["email"], service.frontend_reset_url(token), service.reset_token_minutes())
    service.record_event(audit, "reset_requested", "email_queued", meta, user_id=user["id"], email_hmac=email_hmac)
    background.add_task(_deliver, sender, message, audit, user["id"], meta)
    return Detail(detail=GENERIC_FORGOT)


@router.post("/reset-password", response_model=Detail, responses={400: {"model": Detail}})
def reset_password(payload: ResetPasswordRequest, request: Request, users: UserTable, resets: ResetTable, audit: AuditTable) -> Detail:
    meta = _meta(request)
    try:
        user_id = service.reset_password(users, resets, payload.token.get_secret_value(), payload.new_password.get_secret_value())
    except service.ResetTokenError as error:
        service.record_event(audit, "reset_rejected", error.reason, meta, user_id=error.user_id)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=INVALID_TOKEN) from None
    service.record_event(audit, "reset_completed", "password_updated", meta, user_id=user_id)
    return Detail(detail="Password updated")


@router.post("/change-password", response_model=Detail, responses={400: {"model": Detail}, 401: {"model": Detail}})
def change_password(payload: ChangePasswordRequest, request: Request, current: CurrentUser,
                    users: UserTable, resets: ResetTable, audit: AuditTable) -> Detail:
    meta = _meta(request)
    current_password = payload.current_password.get_secret_value()
    new_password = payload.new_password.get_secret_value()
    if current_password == new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="New password must be different from the current password")
    try:
        service.change_password(users, resets, current["id"], current_password, new_password)
    except service.CurrentPasswordError:
        service.record_event(audit, "password_change_rejected", "wrong_current_password", meta, user_id=current["id"])
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect") from None
    service.record_event(audit, "password_changed", "password_updated", meta, user_id=current["id"])
    return Detail(detail="Password updated")
