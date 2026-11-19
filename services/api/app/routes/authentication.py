"""Login and current-account endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from tinydb.table import Table

from app.auth import CurrentUser, UserTable, create_access_token, find_user_by_email, verify_password
from app.database import get_profiles_table
from app.routes.users import _profile_for_user

router = APIRouter(prefix="/auth", tags=["Authentication"])
ProfileTable = Annotated[Table, Depends(get_profiles_table)]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentAccount(BaseModel):
    email: EmailStr
    role: str
    profile: dict


@router.post("/login", response_model=TokenResponse)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], users: UserTable) -> TokenResponse:
    user = find_user_by_email(users, form.username)
    if user is None or not verify_password(form.password, user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.get("is_active", False):
        raise HTTPException(status_code=401, detail="Inactive account", headers={"WWW-Authenticate": "Bearer"})
    return TokenResponse(access_token=create_access_token(user["id"]))


@router.get("/me", response_model=CurrentAccount)
def get_current_account(current: CurrentUser, profiles: ProfileTable) -> dict:
    profile = _profile_for_user(profiles, current["id"])
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"email": current["email"], "role": current["role"], "profile": profile}
