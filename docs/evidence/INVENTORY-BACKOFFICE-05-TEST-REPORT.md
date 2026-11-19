# INVENTORY-BACKOFFICE-05 — Test report

## Decision

**PARTIAL: 20/30 PASS, 0 FAIL, 10 BLOCKED.**

All 20 task criteria derived from the milestone brief are implemented and verified, including against the real API in a real browser. The 10 evaluation criteria stay BLOCKED because the official rubric text was not supplied.

## Scope and base

- **Branch:** `feature/inventory-backoffice`, created from `feature/inventory-orm-dual-db` at `a3c4c4e` (PR #9, unmerged). That branch contains the inventory API this UI consumes.
- **Stack:** the repository has no Next.js app. `uis/backoffice` is static HTML + Tailwind CDN, so the UI follows that convention:
  - TypeScript modules compiled to native ES modules in `dist/`
  - one shell page with client-side routing for `/backoffice/inventory/...`
  - Jest + jsdom tests
- **Authentication:** reuses the existing `NexovaAuth` module from PR #8 (`feature/bullet-proof-applications`). `uis/backoffice/suppliers/src/auth-session.ts` and `dist/auth-session.js` are checked out **byte-identical**, so the two PRs merge cleanly. No backend changes were taken from PR #8.
- **Backend:** no backend code was changed. The API contracts used are exactly those in `services/api/app/inventory_schemas.py`.

## Environment

macOS 26.6.2 · Node 24.18.0 / npm 11.16.0 · Python 3.11.17 · Docker 29.9.3 · Google Chrome 157 (headless) · PostgreSQL 16 (disposable container).

## Commands and results

| Command (in `uis/backoffice/inventory` unless noted) | Result |
|---|---|
| `npm run typecheck` (app + tests, strict) | PASS, 0 errors |
| `npm run lint` (ESLint 9 + typescript-eslint) | PASS, 0 problems |
| `npm run build` (`tsc` → `dist/`, 14 ES modules) | PASS |
| `npm test` (Jest + jsdom, mocked fetch) | 50 collected: **45 passed, 0 failed, 5 skipped** (the 5 live tests skip unless the e2e runner provides an API) |
| `npm run test:coverage` | statements 92.7%, branches 76.9%, functions 96.1%, lines 97.0% |
| `npm run e2e` | **20/20 checks PASS**. Includes the Jest live suite at **5/5 passed** against the real API. See `inventory-backoffice-05/e2e-results.json`. |
| `cd services/api && .venv/bin/pytest -q -rs` (backend regression) | **60 passed, 0 failed, 0 skipped** (includes the 5 live PostgreSQL tests enabled by the operator's local `.env`) |

Skipped tests are never counted as PASS.

## Real API integration evidence (`npm run e2e`)

The runner isolates everything and never uses the database in `services/api/.env`:

1. A disposable PostgreSQL 16 container with TLS on, a random port and password, removed afterwards.
2. The real FastAPI app with a temporary TinyDB and a random JWT secret. CORS is allowlisted for the backoffice origin only.
3. The briefing seed is created **through the public API only**: `POST /users`, `/auth/login`, `/inventory/products` and orders. The result is NXV-IT-001 = 12 and NXV-PER-001 = 17, and the rows are verified to exist only in the container.
4. `tests/live.integration.test.ts` uses the real `NexovaAuth` login, real HTTP and the real views:
   - Bearer token issued; a real 401 for an invalid token.
   - Inbound increases and outbound decreases stock.
   - Real 400 for insufficient stock and real 422 for a missing employee.
   - The outbound UI shows the real 400 inline and then succeeds.
   - History matches the API.
5. Headless Chrome (CDP, no extra dependencies) checks:
   - all four routes redirect unauthenticated users to login without rendering data
   - login returns to the requested route
   - products match the API, including stock indicators
   - product action → preselected inbound form → stock +4 in the backend, with the double submit guarded and the form reset
   - outbound shows live stock and the client warning → real 400 inline → allocation success, stock −2 in the backend
   - history equals the API's orders, is read-only and shows `user_uuid`
   - a reload drops the in-memory session, with no token in storage or cookies
   - no JavaScript exceptions, and no unexpected failed requests (only the deliberate 400 and an absent favicon)

Screenshots are in `docs/evidence/inventory-backoffice-05/`: `00-login`, `01-products`, `02-inbound-success`, `03-outbound-insufficient-stock`, `04-outbound-success`, `05-history`.

## Authentication verification

- The JWT is held in memory by the existing module and is never written to storage or cookies (verified in the browser).
- Every inventory request sends `Authorization: Bearer <token>`.
- A missing or expired session, or an API 401, logs out and redirects to `/backoffice/login?next=…`. `next` only accepts `/backoffice/inventory/...` paths, which prevents open redirects.

## Known limitations

- **Rubric:** the 10 evaluation criteria are BLOCKED until the official text is supplied.
- **Session lifetime:** with the in-memory session, a full page reload requires signing in again. This is deliberate, to avoid persisting the token.
- **Public GET endpoints:** the backend serves `GET /inventory/products` and `GET /inventory/orders` without authentication (existing contract, unchanged). The UI never requests or renders them without a session, but the API itself does not enforce it for GETs.
- **Tailwind CDN:** the backoffice uses the Tailwind CDN like the existing supplier page. The browser logs its "not for production" warning.
- **Static server:** routes need the SPA-aware `serve.cjs`. A plain static server such as the supplier README's `http-server` serves the supplier page but not the deep inventory routes.

## Professor reproduction

```bash
git switch feature/inventory-backoffice
cd services/api && uv sync && cd -                       # backend deps (psycopg2, FastAPI)
cd uis/backoffice/inventory && npm ci
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e        # requires Docker + Google Chrome; fully self-contained and disposable
```

Manual run against your own API (with `DATABASE_URL` configured):

1. `cd services/api && uv run uvicorn app.main:app --port 8000`
2. `cd uis/backoffice/inventory && npm run serve`
3. Open `http://127.0.0.1:5500/backoffice/inventory/products`. You will be redirected to login. Register a user with `POST /users` if needed.
