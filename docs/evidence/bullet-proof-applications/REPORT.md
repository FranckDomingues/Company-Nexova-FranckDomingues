# Building Bullet-Proof Applications — 28-item evidence report

Status uses PASS only for directly inspected implementation or executed automated evidence. Interactive Swagger criterion is BLOCKED because no browser/API-doc interaction was performed during this milestone. Commands are from repository root unless marked otherwise.

| # | Checklist criterion | Status | Concrete evidence |
|---:|---|---|---|
| 1 | User records persist in TinyDB with expected fields | PASS | `services/api/app/database.py`; `services/api/tests/test_auth.py::test_user_and_profile_data_live_only_in_tinydb_tables` |
| 2 | Profile records persist in TinyDB with expected fields | PASS | Same test asserts profile table and field set |
| 3 | Registration creates exactly one linked profile | PASS | `test_register_creates_normalized_user_and_single_profile` |
| 4 | No SQL ORM persistence introduced | PASS | `services/api/app/database.py` uses TinyDB; no ORM changes in milestone diff |
| 5 | JWT subject identifies TinyDB user id | PASS | `test_jwt_subject_signature_and_configured_expiration` |
| 6 | Roles are restricted to supported values | PASS | `services/api/app/routes/users.py` `Roles`; `test_unique_normalized_email_and_role_validation` |
| 7 | Public registration cannot self-promote or disable account | PASS | Registration posts `role=admin,is_active=False`; returned/stored least-privilege state asserted in `test_register_creates_normalized_user_and_single_profile` |
| 8 | User create/read/update/delete operations exist | PASS | `services/api/app/routes/users.py`; `test_profile_me_and_user_ownership_and_admin_operations`; `test_user_delete_own_and_linked_profile_and_user_crud` |
| 9 | Optional profile data is linked at registration | PASS | `test_register_creates_normalized_user_and_single_profile` |
| 10 | User collection listing is admin-protected | PASS | `test_profile_me_and_user_ownership_and_admin_operations` asserts anonymous 401, user 403, admin success |
| 11 | User can update own credentials; privilege updates admin-only | PASS | Same test asserts self password update and 403 promotion; admin privilege update |
| 12 | Delete removes user and linked profile with authorization | PASS | `test_user_delete_own_and_linked_profile_and_user_crud`; admin deletion assertions in admin operations test |
| 13 | Profile endpoints are caller-scoped | PASS | `test_profile_me_and_user_ownership_and_admin_operations`; routes in `app/routes/users.py` |
| 14 | Login and current-account routes are implemented | PASS | `services/api/app/routes/authentication.py`; `test_password_login_and_auth_me_exclude_hashes` |
| 15 | Password hashes are never exposed in public auth responses | PASS | Registration and `/auth/me` assertions in `test_register_creates_normalized_user_and_single_profile` and `test_password_login_and_auth_me_exclude_hashes` |
| 16 | OAuth2 bearer flow and declared dependencies are used | PASS | `services/api/app/auth.py`, `services/api/pyproject.toml`, `services/api/uv.lock` |
| 17 | Password is hashed and checked | PASS | Hashed storage and successful/failed login assertions in `test_register_creates_normalized_user_and_single_profile`, `test_password_login_and_auth_me_exclude_hashes`; new `bcrypt_sha256` accepts API's 128-character boundary |
| 18 | Signing secret and expiry are environment-configurable | PASS | `JWT_SECRET_KEY`/`JWT_ACCESS_TOKEN_EXPIRE_MINUTES` in `app/auth.py`; exact token duration assertion in `test_jwt_subject_signature_and_configured_expiration` |
| 19 | JWT signature, expiry, subject, user existence and active state are checked | PASS | `test_jwt_subject_signature_and_configured_expiration`, `test_tokens_missing_exp_claim_and_expiration_boundary_are_rejected`, `test_inactive_and_deleted_users_cannot_use_existing_tokens` |
| 20 | Unauthenticated and unauthorized requests distinguish 401/403 | PASS | Token and ownership/role assertions in `services/api/tests/test_auth.py` |
| 21 | At least five sensitive existing routes require auth | PASS | Six `/suppliers` methods tested 401 without token in `test_existing_sensitive_supplier_routes_require_manager_or_admin` |
| 22 | Authorized supplier behavior works | PASS | Same test exercises manager create/list/detail/rate/status/delete; `services/api/tests/test_suppliers.py` regression suite |
| 23 | Public health route remains public | PASS | `test_public_health_endpoint_remains_available_without_auth` |
| 24 | Auth is stateless bearer-token based | PASS | `OAuth2PasswordBearer`, JWT dependency in `services/api/app/auth.py`; no session/cookie implementation introduced |
| 25 | Tests are isolated and do not use production data/secrets | PASS | `tmp_path`, isolated `JWT_SECRET_KEY`, dependency overrides in API test fixtures; no production service integration |
| 26 | Authentication automated tests and coverage threshold pass | PASS | `cd services/api && uv run pytest --cov=app.auth --cov=app.routes.authentication --cov-report=term-missing`: 30 passed, total 91% (auth 89%, route 97%) |
| 27 | Existing tests/regressions pass | PASS | `cd services/api && uv run pytest -q`: 30 passed, 0 failed; one external deprecation warning |
| 28 | Interactive `/docs` browser authorization flow exercised | BLOCKED | Not executed for this milestone; no browser evidence is claimed. Automated API/TestClient auth evidence is in `test_auth.py`; Swagger reproduction instructions are in `TESTING.md`. |

## Additional required milestone evidence

- API-042 `app/routes/users.py`: 87% coverage; API-042 `app/routes/suppliers.py`: 96% coverage. Each measured by its own sequential `pytest --cov` command documented in `TESTING.md`.
- FE-019: `uis/backoffice/suppliers/src/supplier-utils.ts` has four actual supplier UI utilities; Jest reports 1 suite/4 tests passed, 96.42% statements, 91.3% branches, 100% functions, 95.45% lines. `npm run build` compiles the actual page-consumed browser bundle.
- Reproduction: see `TESTING.md`. No coverage directories, `node_modules`, or Python build metadata should be committed.
