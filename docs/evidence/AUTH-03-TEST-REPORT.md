# AUTH-03 — Test report

- **Branch:** `feature/password-reset` (based on `feature/auth-frontend`). The commit is the one containing this file; see the PR.
- **Environment:** macOS (Darwin 25.6), Python 3.11 via `uv`, Node 22, Docker 29.5.2, headless Google Chrome. Run on 2026-11-19.
- **Labels:** *Simulated* means `fetch` or the email provider is replaced by a contract-faithful fake. *Real* means the real FastAPI app and real HTTP. No real email was delivered (no Resend key; see the checklist).

## Commands and results

| Gate | Command | Result |
|---|---|---|
| Backend tests | `cd services/api && uv run pytest -q` | **92 passed, 0 failed** (60 existing + 32 new in `tests/test_password_reset.py`) |
| Frontend lint | `cd uis/backoffice/inventory && npm run lint` | PASS |
| Frontend typecheck (app + tests) | `npm run typecheck` | PASS |
| Build (`tsc` + NexovaAuth bundle) | `npm run build` | PASS; `dist/` matches the sources |
| Frontend unit (simulated backend) | `npm test` | **142 passed, 0 failed**, 14 skipped (the live suite, run in the next row) |
| Live API integration (real API; email to the capture server) | inside `npm run e2e:password` | **14 passed, 0 failed** (5 Hito 5 + 6 AUTH-02 + 3 AUTH-03) |
| Browser E2E (real API + PostgreSQL + Chrome; simulated email provider) | `npm run e2e:password` | **56 passed, 0 failed** (36 earlier milestones + 20 AUTH-03) → [`auth-03/e2e-results.json`](./auth-03/e2e-results.json) |
| Real Resend reachability probe | see the security report | Resend answered `401 validation_error` to an invalid key (expected) |
| Real Resend delivery | `E2E_RESEND_TO=… npm run e2e:password` | **BLOCKED**: no `RESEND_API_KEY` available |
| Whitespace | `git diff --check` | clean |

New AUTH-03 tests: backend 32, frontend unit 21 (`tests/password.test.ts`), live 3, E2E 20. Existing tests that needed updating: `routes.test.ts` (the exact protected-route set now includes `/backoffice/account/change-password`) and the test fakes in `helpers.ts`.

## Backend tests (`tests/test_password_reset.py`, 32)

| Area | Tests |
|---|---|
| Forgot password | registered email → link, hash only, raw token never stored or returned; unknown email gives an identical status, body and headers and no email; inactive account; malformed input → 422; provider failure → generic 200 + audit; no key configured → disabled sender, generic 200 |
| Reset password | success updates the bcrypt hash, consumes the token and swaps credentials; reuse → 400; expiry for 15/30/60 min (1 s past); still valid 10 s before expiry; config outside 15–60 rejected (3 values); forged token → 400, empty or oversized → 422; weak password → 422 without consuming the token; a later reset revokes other links; **8 concurrent attempts → exactly 1 success**; **storage failure → password rolled back** |
| Change password | 401 with no token or a malformed token; wrong current password → 400 (and audited); success swaps credentials and revokes open reset links; policy 422; identical password → 400 |
| EXTRA-02 | silent per-email limit for registered and unknown addresses, released after 1 h; per-IP → 429 + `Retry-After` |
| EXTRA-03 | event sequence, UTC timestamps, IP, user agent, provider message id; no token, hash, password or email in the audit table |
| Logging | DEBUG-level capture of the whole flow contains no token, password or email |
| Resend adapter | exact request (path `/emails`, Bearer, User-Agent, from/to/subject/html/text) against a local HTTP server; 403 → typed error with no key in it; unreachable → status 0; provider selected from the environment |
| EXTRA-01 template | viewport and max-width, link escaping, text fallback |

## Frontend tests (`tests/password.test.ts`, 21)

| Area | Tests |
|---|---|
| `/forgot-password` | POST body, generic confirmation, form disabled, no second request; same message for an unknown address; client email validation; network error and 429 → accessible error and form re-enabled; public route (no session check, a signed-in user is not redirected) |
| `/reset-password` | token read and removed from the URL, never rendered; mismatch and policy errors before any request; exact POST body; success → `/login?reason=password-reset` with a message, old browser session cleared; expired, used and forged tokens → error + "Solicitar un nuevo enlace" (the link works); missing token → immediate error; token never logged |
| `/account/change-password` | requires a session; mismatch, same-as-current and empty-current errors before any request; API 400 → current-field error, session kept; success → Bearer POST, exact body, feedback, form cleared; 401 → AUTH-02 session flow |
| Links | visible "¿Olvidaste tu contraseña?" on `/login` opens the form; the profile links to change-password |
| `validateNewPassword` | policy and confirmation rules |

## Mutation checks

Each protection was removed on purpose and the suite run again; every mutation made at least one test fail. The code was restored afterwards.

| Mutation | Failing tests |
|---|---|
| Remove the lock around token consumption | concurrent reuse (1) |
| Remove the `used_at` check | audit sequence (1). Reuse is still blocked by the `password_changed_at` layer, which is intended defence in depth |
| Remove the expiry check | expiry 15/30/60 (3) |
| Remove the rollback on failure | atomicity (1) |
| Skip the current-password check | wrong-current 400 (1) |
| Skip revoking the user's other links | atomicity (1); the `password_changed_at` layer still rejects them |
| Return 404 for unknown emails | indistinguishable response and both rate-limit tests (3) |
| Disable the per-email limit | per-email limit (1) |
| Re-enable the forgot form after sending | F01 (1) |
| Leave the token in the URL | F02 (1) |
| Skip the confirmation check | F03 (1) |
| Change the login link text | F04 (1) |
| No recovery link on an invalid token | F02 invalid-token cases (3) |

## Regression of existing authentication

- AUTH-01 backend: all 60 earlier pytest tests pass. The shared `Password` type replaced two copies of `Field(min_length=8, max_length=128)` without changing behaviour.
- AUTH-02 and Hito 5 frontend: all 121 earlier Jest tests pass, as do the 36 earlier E2E checks and 11 earlier live tests in the same run. That covers login, register, profile, guard, Bearer, logout, 401 and 403, and the inventory flows.
- The login page keeps its earlier behaviour (wrong-password message, no redirect loop, `?next`, session-expired notice); it only gains the link and the `password-reset` notice.

## Two harness defects found and fixed while running E2E

1. The live Jest suite was started with `spawnSync`, which blocked the event loop of the process hosting the email capture server. Both the API's `POST /emails` and the test's read-back timed out. It is now started with an async `spawn`.
2. The AUTH-03 section cleared `localStorage` while Chrome was still on the public website's origin, so the backoffice session survived and `/login` correctly redirected away. The harness now clears storage on the backoffice origin first.

Neither was a product defect; both made the first runs fail and are fixed in the harness.
