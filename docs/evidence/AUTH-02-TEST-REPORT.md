# AUTH-02 — Test report

- **Branch:** `feature/auth-frontend`. Run on 2026-11-18 on macOS (Darwin 25.6), Node 22, Docker 29.5.2, Google Chrome (headless), Python 3.11 via `uv`.
- **Labels:** *Simulated* tests mock `fetch` (with a stateful fake of the real FastAPI contracts) but use the real `NexovaAuth` module, HTTP client and views. *Real* tests use the real FastAPI app with real JWTs, a disposable PostgreSQL 16 container and a temporary TinyDB, without mocks.

## Results

| Gate | Command (from `uis/backoffice/inventory/` unless noted) | Result |
|---|---|---|
| Lint | `npm run lint` | PASS (0 problems) |
| Typecheck (app + tests) | `npm run typecheck` | PASS |
| Build (`tsc` + NexovaAuth bundle) | `npm run build` | PASS |
| Unit/component (simulated) | `npm test` | **121 passed, 0 failed**, 11 skipped (the live suite, which runs in the E2E gate) |
| Live API integration (real) | inside `npm run e2e:auth` | **11 passed, 0 failed** (5 Hito 5 + 6 AUTH-02) |
| Browser E2E (real) | `npm run e2e:auth` | **36 passed, 0 failed** ([`auth-02/e2e-results.json`](./auth-02/e2e-results.json)) |
| Backend regression | `cd services/api && uv run pytest -q` | **60 passed, 0 failed** (backend unchanged) |
| Whitespace | `git diff --check` | clean |

Unit totals by suite: `auth.test.ts` 34, `auth-session.test.ts` 15, `supplier-directory.test.ts` 7, `public-website.test.ts` 5, `auth-ssr.test.ts` 3 (**64 new AUTH-02 tests**). The Hito 5 suites still pass in full: `api` 11, `routes` 9, `route-states` 9, `inbound` 8, `products` 5, `outbound` 5, `history` 5 and `terminology` 5 (57 tests).

### Mutation spot-check

Each key behaviour was broken on purpose, the tests were run again, and the code was restored. Every mutation made at least one test fail:

| Mutation | Tests that caught it |
|---|---|
| Skip the `GET /auth/me` verification in the guard | T08a, T09, T15, unreachable-API (4 failures) |
| Do not persist the token on login | T01, storage-key and related tests (4 failures) |
| Ignore 401 in the shared client | T13, T13b (2) |
| Treat 403 like 401 | 403 ≠ 401 test (1) |
| Supplier page without the `Authorization` header | supplier manager and 401 tests (2) |
| Logout without removing the token | T12 (1) |
| Remove the "already on /login" redirect guard | T14c (1). This test was added after the first round showed the gap. |

## Required test cases

| # | Required test | Simulated (Jest) | Real (Live / E2E) | Result |
|---|---|---|---|---|
| 1 | Successful login and token persistence | T01; `auth-session` "uses one key" | Live: register/login → `localStorage`; E2E: login, then "full reload keeps the session", "correct password → token stored" | PASS |
| 2 | Invalid credentials, clear error | T02, malformed input, network error | Live "wrong password"; E2E "wrong password → clear error, URL unchanged, no token" (`08-login-error.png`) | PASS |
| 3 | Registration followed by login | T03 (exact `POST /users` body, then `POST /auth/login` with the same credentials) | Live register → login; E2E UI registration → main view (`10-registered-main-view.png`) | PASS |
| 4 | Registration validation failures | T04a client, T04b 409, T04c 422, "created but login failed" | Live 409 and API 422; E2E client 8-char rule and real 409 (`09-register-errors.png`) | PASS |
| 5 | Authenticated profile read | T05 | E2E profile shows the account from `GET /auth/me` (`06-profile.png`) | PASS |
| 6 | Profile update | T06, validation/422 | Live `PUT /profiles/me`; E2E update confirmed by an independent `GET /auth/me` | PASS |
| 7 | Missing-token redirect | T07 for all 5 SPA routes; supplier "no token" | E2E 4 inventory routes → login; profile after logout → login | PASS |
| 8 | Invalid or expired token redirect | T08a forged → 401 → removed; T08b expired `exp` | Live forged token rejected and removed; E2E forged token → login, no private content | PASS |
| 9 | Valid authenticated access | T09; supplier manager test | E2E Hito 5 flow, reload, profile, manager supplier list (`07-suppliers-manager.png`) | PASS |
| 10 | Public website without a token | `public-website.test.ts` (static scan + jsdom load) | E2E both pages on their own origin, no redirect (`11-public-website.png`); `git diff main -- uis/website` empty | PASS |
| 11 | Bearer header on protected requests | T11; supplier Bearer test | E2E: `/suppliers` accepts the browser's manager token; profile `PUT` accepted | PASS |
| 12 | Logout clears state and storage | T12, cross-tab, supplier logout | E2E logout → no key, `?reason=logout`, private view → login | PASS |
| 13 | Protected API 401 clears the session | T13, T13b, supplier 401, stale-401 ignored | Live forged token → `onUnauthorized` once; E2E user deactivated mid-session → real 401 → token removed → `?reason=session` | PASS |
| 14 | Login 401 without redirect loops | T14 (two failed attempts: URL and history unchanged, 1 request each), T14b (stale token on `/login`), T14c | E2E wrong password: URL unchanged after 500 ms | PASS |
| 15 | No protected-content flash during initial auth | T15 (`/auth/me` held open: only `#session-check`, nav and account hidden, no data request); supplier "hidden until verified" | E2E: account tools `display: none` on login (found and fixed a Tailwind `hidden` + `.flex` bug) | PASS |
| 16 | Compatibility with existing functionality | All 57 Hito 5 unit tests | All 19 shared/Hito 5 E2E checks (environment, inventory flows, stock, history, no JS errors, no unexpected network failures) and 5 Hito 5 live tests. The other 17 E2E checks are AUTH-02; supplier directory works again with a token; pytest 60/60 | PASS |

## What is simulated and what is real

- **Real end to end:** everything in the E2E and Live columns. The run starts its own disposable PostgreSQL container and FastAPI process with a random `JWT_SECRET_KEY`, creates users only through `POST /users`, and drives Chrome over CDP. It never reads `services/api/.env` or touches a shared database.
- **Simulated:** the Jest column. The fake backend reproduces the AUTH-01 status codes and bodies (`Incorrect email or password`, `Invalid or expired bearer token`, 409 `Email is already registered`, 422 `detail[]`). Its JWTs are fake strings with unverifiable signatures.
- **Test-only manipulation in E2E:** to exercise the 403/manager path and a server-side 401, the runner edits the temporary TinyDB file directly (role `manager`, then `is_active: false`) and restores it afterwards. The AUTH-01 testing guide does the same thing for manager tests. No role-assignment endpoint exists or was added.

## Secrets hygiene

- No real JWT, password or secret is committed. A scan for `eyJ…` in `docs/evidence/auth-02/` and all frontend sources returned nothing. E2E passwords are random per run and never written to evidence.
- Unit test "never logs credentials or tokens" spies on every `console` method across login, failed login and logout.
- Screenshots show only throwaway `@nexova.example` accounts. Password fields are masked.

## Known limitations

- The no-flash guarantee is proven in jsdom (T15) and backed by hidden-by-default markup checked in Chrome. The E2E run does not take a frame-by-frame paint capture.
- The supplier page's real browser redirect is verified in E2E. jsdom cannot navigate, so its unit tests assert the session effects (token removed, page kept hidden).
