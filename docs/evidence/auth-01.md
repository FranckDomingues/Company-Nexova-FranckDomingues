# AUTH-01 — API authentication and route protection evidence

**Branch:** `feature/auth-api`  
**Scope:** FastAPI in `services/api`; TinyDB-only users and profiles; stateless JWT bearer auth.  
**Test command:** `cd services/api && uv sync --extra dev && uv run pytest -q`

## Academy checklist evidence (28 items)

| # | Requirement | Status | Evidence / automated test |
|---|---|---|---|
| 1 | User storage is TinyDB with required fields | PASS | `app/database.py` tables; `test_user_and_profile_data_live_only_in_tinydb_tables` asserts exact user field set. |
| 2 | Profile storage is TinyDB with required fields | PASS | Exact profile fields asserted in `test_user_and_profile_data_live_only_in_tinydb_tables`. |
| 3 | Exactly one linked profile on registration | PASS | `test_register_creates_normalized_user_and_single_profile`. |
| 4 | No User/Profile SQL persistence | PASS | API uses TinyDB tables only; same persistence test asserts table names and field sets; no ORM dependency. |
| 5 | JWT subject is TinyDB user ID | PASS | `test_jwt_subject_signature_and_configured_expiration` asserts `sub == "1"`. |
| 6 | Allowed roles only | PASS | Pydantic `Roles` enum literal in `routes/users.py`; invalid role 422 test in `test_unique_normalized_email_and_role_validation`. |
| 7 | Registration cannot self-promote | PASS | Registration ignores accepted role/status fields; registration test posts admin/inactive and verifies user/active. |
| 8 | Complete user CRUD routes | PASS | `routes/users.py`; `test_profile_me_and_user_ownership_and_admin_operations` and `test_user_delete_own_and_linked_profile_and_user_crud`. |
| 9 | Registration links optional profile fields | PASS | `test_register_creates_normalized_user_and_single_profile`. |
| 10 | User list protected, least privilege | PASS | `GET /users` requires admin; list 401/403/admin success assertions in `test_profile_me_and_user_ownership_and_admin_operations`. |
| 11 | Credential update self/admin; role admin-only | PASS | Self password update succeeds; self promotion 403; admin role update succeeds in `test_profile_me_and_user_ownership_and_admin_operations`. |
| 12 | Delete removes profile, authorization protected | PASS | Self/admin delete, unauthorized behavior, and no profile leftover asserted in auth tests. |
| 13 | Profile GET/PUT self-only | PASS | `test_profile_me_and_user_ownership_and_admin_operations`. |
| 14 | Login and auth/me endpoints | PASS | `test_password_login_and_auth_me_exclude_hashes`. |
| 15 | Auth response excludes password hash | PASS | Registration and `/auth/me` response assertions in auth tests. |
| 16 | OAuth2 bearer / required libraries / uv | PASS | `app/auth.py`, `OAuth2PasswordBearer`; `pyproject.toml` declares python-jose, libpass and password hashing import; lockfile managed by uv. |
| 17 | Hash before storage and verify on login | PASS | Hash storage and wrong/correct password login assertions in auth tests. |
| 18 | JWT secret/expiry environment-configurable | PASS | `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`; exact exp delta tested. |
| 19 | Token verifies signature, expiry, subject, existence, active | PASS | Expired/tampered/malformed/missing/inactive/deleted cases in auth tests. |
| 20 | 401 unauthenticated, 403 forbidden | PASS | Bearer and ownership assertions in auth tests. |
| 21 | Existing sensitive routes protected (5+) | PASS | Six supplier routes listed below; unauthenticated tests expect 401. |
| 22 | Existing authorized supplier behavior preserved | PASS | Manager create/list/detail/rate/status/delete operations asserted in `test_existing_sensitive_supplier_routes_require_manager_or_admin`; legacy tests. |
| 23 | Public health endpoint preserved | PASS | `test_public_health_endpoint_remains_available_without_auth` confirms `GET /health` returns 200 unauthenticated. |
| 24 | Stateless/no session-cookie auth | PASS | OAuth2 bearer JWT only; no session/cookie middleware or persistence introduced. |
| 25 | Isolated test data / no secrets committed | PASS | `tmp_path` TinyDB test DB, test-only secret injected per fixture; no `.env` file or real data changes. |
| 26 | Automated coverage for required auth scenarios | PASS | `tests/test_auth.py` covers registration, policy, credentials, token edges, profile, CRUD, protected routes and consistency. |
| 27 | Existing tests and compatibility | PASS | `uv run pytest -q`: 24 passed (see report). |
| 28 | Interactive `/docs` browser test | FAIL | Not executed interactively in browser. Reproduce: set env vars, run `uv run uvicorn app.main:app --reload`, visit `http://127.0.0.1:8000/docs`; exercise Authorize, `/auth/login`, and protected endpoint. |

## Protected existing routes

Least privilege: all `/suppliers` routes require `manager` or `admin` (the account roles remain `admin`, `manager`, `user`). Exact method/path combinations:

- `POST /suppliers`
- `GET /suppliers`
- `GET /suppliers/{supplier_id}`
- `PATCH /suppliers/{supplier_id}/rate`
- `PATCH /suppliers/{supplier_id}/status`
- `DELETE /suppliers/{supplier_id}`

Each is tested without credentials as 401. Manager-authorized successful behavior is asserted for all six. `/health` remains public.

## Test execution

`cd services/api && uv run pytest -q` — **25 passed, 0 failed**, one third-party Starlette/httpx deprecation warning. Browser interaction is not verified (checklist item 28 remains FAIL).

## Interactive docs reproduction

```sh
cd services/api
export JWT_SECRET_KEY="replace-with-a-secret-at-least-32-characters-long"
export JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
uv run uvicorn app.main:app --reload
# Open http://127.0.0.1:8000/docs
```

Register a user, use `/auth/login` with `username` and `password` form fields, click Authorize and provide its token, then call `/auth/me` and `/profiles/me`. To exercise supplier management, a manager/admin user must be provisioned through an authorized administrative process (public registration cannot assign the role).
