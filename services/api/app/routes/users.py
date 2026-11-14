"""User account and linked profile API."""

from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator
from tinydb import Query
from tinydb.table import Table

from app.auth import AdminUser, CurrentUser, UserTable, find_user_by_email, hash_password
from app.database import get_profiles_table

router = APIRouter(tags=["Users"])
ProfileTable = Annotated[Table, Depends(get_profiles_table)]
Roles = Literal["admin", "manager", "user"]


class ProfileFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)

    @field_validator("name", "phone", "address")
    @classmethod
    def clean_fields(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
        return value or None


class UserRegistration(ProfileFields):
    email: EmailStr
    password: SecretStr = Field(min_length=8, max_length=128)
    # Accepted to validate legacy clients' role field, but never applied during signup.
    role: Roles | None = None
    is_active: bool | None = None


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr | None = None
    password: SecretStr | None = Field(default=None, min_length=8, max_length=128)
    role: Roles | None = None
    is_active: bool | None = None
    name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=500)

    @field_validator("role", "is_active", mode="before")
    @classmethod
    def privilege_fields_cannot_be_null(cls, value):
        if value is None:
            raise ValueError("privilege fields cannot be null")
        return value


class PublicUser(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    role: Roles
    created_at: datetime


def _public_user(user: dict) -> dict:
    return {key: user[key] for key in ("id", "email", "is_active", "role", "created_at")}


def _profile_for_user(profiles: Table, user_id: int) -> dict | None:
    profile = profiles.get(Query().user_id == user_id)
    return dict(profile) if profile is not None else None


def _create_profile(profiles: Table, user_id: int, fields: dict) -> dict:
    profile_id = profiles.insert({"user_id": user_id, **fields})
    profiles.update({"id": profile_id}, doc_ids=[profile_id])
    return dict(profiles.get(doc_id=profile_id))


def _remove_partial_user(users: Table, profiles: Table, user_id: int) -> None:
    profiles.remove(Query().user_id == user_id)
    users.remove(doc_ids=[user_id])


@router.post("/users", response_model=PublicUser, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegistration, users: UserTable, profiles: ProfileTable) -> dict:
    email = str(payload.email).strip().casefold()
    if find_user_by_email(users, email):
        raise HTTPException(status_code=409, detail="Email is already registered")
    user_id: int | None = None
    try:
        user_id = users.insert({
            "email": email,
            "user_uuid": str(uuid4()),
            "hashed_password": hash_password(payload.password.get_secret_value()),
            "is_active": True,
            "role": "user",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        users.update({"id": user_id}, doc_ids=[user_id])
        _create_profile(profiles, user_id, {key: getattr(payload, key) for key in ("name", "phone", "address")})
        return dict(users.get(doc_id=user_id))
    except Exception:
        if user_id is not None:
            _remove_partial_user(users, profiles, user_id)
        raise


@router.get("/users", response_model=list[PublicUser])
def list_users(user: AdminUser, users: UserTable) -> list[dict]:
    return [_public_user(dict(record)) for record in users.all()]


@router.get("/users/{user_id}", response_model=PublicUser)
def get_user(user_id: int, current: CurrentUser, users: UserTable) -> dict:
    if current["id"] != user_id and current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Cannot access another user")
    user = users.get(doc_id=user_id)
    if user is None or user.get("id") != user_id:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(user)


@router.put("/users/{user_id}", response_model=PublicUser)
def update_user(
    user_id: int, payload: UserUpdate, current: CurrentUser, users: UserTable, profiles: ProfileTable
) -> dict:
    if current["id"] != user_id and current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Cannot modify another user")
    user = users.get(doc_id=user_id)
    if user is None or user.get("id") != user_id:
        raise HTTPException(status_code=404, detail="User not found")
    changes = payload.model_dump(exclude_unset=True)
    if "role" in changes and current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only administrators may change roles")
    if "email" in changes and changes["email"] is not None:
        email = str(changes["email"]).strip().casefold()
        duplicate = find_user_by_email(users, email)
        if duplicate and duplicate.get("id") != user_id:
            raise HTTPException(status_code=409, detail="Email is already registered")
        changes["email"] = email
    if "password" in changes:
        if changes["password"] is not None:
            changes["hashed_password"] = hash_password(changes["password"].get_secret_value())
        del changes["password"]
    profile_fields = {key: changes.pop(key) for key in ("name", "phone", "address") if key in changes}
    if any(key in changes for key in ("role", "is_active")) and current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only administrators may change account privileges")
    profile = _profile_for_user(profiles, user_id)
    if profile_fields and profile is None:
        raise HTTPException(status_code=500, detail="User profile is missing")
    old_user = dict(user)
    old_profile = {key: profile.get(key) for key in profile_fields} if profile is not None else {}
    try:
        if profile_fields and profile is not None:
            profiles.update(profile_fields, doc_ids=[profile["id"]])
        if changes:
            users.update(changes, doc_ids=[user_id])
    except Exception:
        if profile_fields and profile is not None:
            profiles.update(old_profile, doc_ids=[profile["id"]])
        users.update(old_user, doc_ids=[user_id])
        raise
    return dict(users.get(doc_id=user_id))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, current: CurrentUser, users: UserTable, profiles: ProfileTable) -> Response:
    if current["id"] != user_id and current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Cannot delete another user")
    user = users.get(doc_id=user_id)
    if user is None or user.get("id") != user_id:
        raise HTTPException(status_code=404, detail="User not found")
    # Delete the dependent profile first; restore it if deleting the user fails.
    profile = _profile_for_user(profiles, user_id)
    try:
        profiles.remove(Query().user_id == user_id)
        users.remove(doc_ids=[user_id])
    except Exception:
        if profile is not None and _profile_for_user(profiles, user_id) is None:
            profiles.insert(profile)
        if users.get(doc_id=user_id) is None:
            users.insert(user, doc_id=user_id)
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/profiles/me")
def get_my_profile(current: CurrentUser, profiles: ProfileTable) -> dict:
    profile = _profile_for_user(profiles, current["id"])
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/profiles/me")
def update_my_profile(payload: ProfileFields, current: CurrentUser, profiles: ProfileTable) -> dict:
    profile = _profile_for_user(profiles, current["id"])
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    profiles.update(payload.model_dump(), doc_ids=[profile["id"]])
    return dict(profiles.get(doc_id=profile["id"]))
