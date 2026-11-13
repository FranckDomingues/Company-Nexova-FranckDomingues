# Building Bullet-Proof Applications — plan and reproduction

## Baseline and scope

- Milestone branch: `feature/bullet-proof-applications` (created from candidate `feature/auth-api`, commit `ce80160830f1dc44ca5fc93bca933824b73e50a6`). The candidate inherits supplier-directory commit `d85cad3589ddd9710cfff7898a3f82fe482804a5`, whose base is `main` commit `047da24ec0ac3e2ebe6972d89f26abed37acd0d5`. PRs #4 and #5 were open/unmerged when inspected. No branch was merged and `main` was not modified.
- API root: `services/api`; FastAPI + TinyDB. Test fixtures use per-test temporary databases and JWT test secrets, dependency overrides, with no connection to production services.
- Actual auth routes: `POST /users`, `POST /auth/login`, `GET /auth/me`. Backoffice route groups: supplier directory in `app/routes/suppliers.py`; account and profile administration in `app/routes/users.py` (`POST /users` is registration and is counted in both relevant behaviors, not as a fabricated route).
- Initial source had HTML/plain JS frontend, not Next.js or TypeScript application logic; `packages/shared/types/index.ts` contains only types. The real supplier directory had four substantive utility behaviors inline. They were extracted into typed `uis/backoffice/suppliers/src/supplier-utils.ts` and loaded by the real page through the checked-in compiled browser bundle at `uis/backoffice/suppliers/dist/supplier-utils.js`. Jest/ts-jest is configured locally for that existing behavior, rather than making dummy utilities. There is no claim that the repository is a Next.js app.

## Authentication inventory and test matrix

| Actual endpoint | Decision, inputs, output and dependencies | Happy path | Edge / boundary | Failure modes exercised |
|---|---|---|---|---|
| `POST /users` | Normalize email, reject duplicate, validate password (8–128 chars), hash password, create active least-privilege account and linked profile. JSON: email/password and optional profile fields; optional legacy role/active are accepted but ignored. Returns public user (201). Depends on users/profile TinyDB and hasher. | `test_register_creates_normalized_user_and_single_profile` verifies normalized email, least privilege, hash not exposed and profile linkage. | `test_registration_password_length_boundaries_and_empty_password`: lengths 0, 8, 128, 129. | Case-folded duplicate and invalid role: `test_unique_normalized_email_and_role_validation`; profile persistence failure rollback: `test_registration_rolls_back_user_when_profile_insert_fails`. Pydantic rejects malformed email/short password as request validation. |
| `POST /auth/login` | OAuth2 form `username`/`password`; normalized email lookup, password verification, active-state check; returns bearer JWT. Depends on users TinyDB, verifier, configured signing secret/expiry. | `test_password_login_and_auth_me_exclude_hashes` and successful calls in other auth tests. | Form requires both fields; a whitespace password is supplied to exercise present-but-invalid password, while an omitted/empty form value is rejected by OAuth2 form validation (422) before business logic. | Wrong password, unknown user and inactive user: `test_login_empty_unknown_and_inactive_account_failures`. |
| `GET /auth/me` | Bearer JWT must have valid signature, exp, numeric string `sub`, active existing user; then returns email, role and profile. Depends on users/profile tables and JWT config. | `test_password_login_and_auth_me_exclude_hashes`. | Expiration boundary token at Unix timestamp 1: `test_tokens_missing_exp_claim_and_expiration_boundary_are_rejected`; missing profile is covered through profile route behavior in route tests (404). | Missing/malformed/basic tokens, tampered signature, expired token, missing `exp`, inactive/deleted user: `test_missing_or_malformed_tokens_are_401`, `test_jwt_subject_signature_and_configured_expiration`, `test_inactive_and_deleted_users_cannot_use_existing_tokens`, and boundary test. |

JWT expiry cases use signed fixed claims and require no sleeps or real-time waits. Expired/malformed/signature and missing-claim cases apply to both protected route groups. JWT claims absent `exp` were previously accepted; regression test now guards explicit rejection.

## API-042: actual backoffice route groups

| Group / actual endpoints | Happy-path evidence | Edge evidence | Failure-mode evidence |
|---|---|---|---|
| `app/routes/suppliers.py`: `POST/GET /suppliers`, `GET /suppliers/{supplier_id}`, `PATCH /suppliers/{supplier_id}/rate`, `PATCH /suppliers/{supplier_id}/status`, `DELETE /suppliers/{supplier_id}` | `test_create_list_filter_detail_and_delete`; `test_rate_and_status_updates_validate_and_update_timestamp`; protected manager CRUD assertion in `test_existing_sensitive_supplier_routes_require_manager_or_admin`. | Empty filtered results and valid country/category filters; repeated delete; minimum positive values; idempotent seed in `test_seed_is_idempotent_and_persists_to_database`. | Bad enum/filters and invalid payloads in `test_invalid_supplier_payload_is_422_before_persistence`, unknown IDs 404, unauthenticated 401, regular user 403, malformed/expired JWT in `test_supplier_list_rejects_invalid_tokens_and_accepts_manager_token`. |
| `app/routes/users.py`: `POST /users`, `/users` list, `/users/{user_id}` get/update/delete, `/profiles/me` get/update | Registration/profile linking and full admin/self route behavior in `test_profile_me_and_user_ownership_and_admin_operations` and `test_user_delete_own_and_linked_profile_and_user_crud`. | Password lengths 0/8/128/129; self updates; optional profile whitespace normalization; empty/omitted fields through Pydantic partial updates and route calls. | Duplicate email, invalid role/password, unauthenticated 401, non-owner and non-admin 403, missing record/profile 404/500 branches, inactive login and persistence rollback tested. |

## Frontend utilities (FE-019)

The original supplier UI had real implementations for category label lookup, HTML escaping, currency formatting and renewal date window logic. These are now named exports in `src/supplier-utils.ts`, used by the actual page, with the same behavior plus defensive validation for malformed currency/date inputs. `src/supplier-utils.test.ts` has one test per utility covering successful behavior and fallback/error inputs. This is a deliberately scoped TypeScript module and not a fabricated Next.js project.

## Reproduction and measured evidence

Run each Python coverage command **sequentially** (pytest-cov writes `.coverage`; concurrent runs contend on the same SQLite file). From a clean checkout:

```sh
cd services/api
uv sync --extra dev
uv run pytest -q
uv run pytest --cov=app.auth --cov=app.routes.authentication --cov-report=term-missing
uv run pytest --cov=app.routes.users --cov-report=term-missing
uv run pytest --cov=app.routes.suppliers --cov-report=term-missing
cd ../../uis/backoffice/suppliers
npm ci
npm test
npm run build
```

Observed in this worktree: API `30 passed, 0 failed` (one third-party Starlette/httpx deprecation warning). Coverage from the exact commands above: auth aggregate `91%` (`app/auth.py` 89%; `app/routes/authentication.py` 97%); users/profiles module `87%`; suppliers module `96%`. Jest: 1 suite, 4 tests passed; statement 96.42%, branch 91.3%, functions 100%, lines 95.45%. TypeScript browser bundle build passed with `tsc -p tsconfig.build.json`.

The auth regression fixes were minimal: use `bcrypt_sha256` for newly stored hashes because raw bcrypt truncates inputs over 72 bytes while registration permits 128 characters; retain verification for existing raw bcrypt hashes. Reject signed JWTs with no `exp` because the API's own tokens always expire. Tests cover both changes. `.gitignore` excludes generated Python metadata, coverage and frontend dependencies/coverage; the compiled browser bundle is intentional and checked in so the static UI can consume the TypeScript utilities without a runtime build step.

## AI-assisted edge-case review

The added review identified password length vs bcrypt's byte limit, missing JWT `exp`, expiry-boundary behavior, profile-write rollback, unsafe HTML characters, invalid currency codes, impossible ISO calendar dates, and the renewal horizon's inclusive 60-day boundary. Regression/utility tests exercise these cases. The checked-in reports list only commands actually executed; no claim of interactive Swagger verification is made for this milestone.
