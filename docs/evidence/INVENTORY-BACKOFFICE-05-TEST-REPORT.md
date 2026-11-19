# INVENTORY-BACKOFFICE-05 — Test report

## Decision

**PASS: 30/30** (20 development + 10 official evaluation criteria).

| Block | Result |
|---|---|
| Development criteria | 20/20 PASS |
| Provisional engineering checks (PROV-01…10, internal) | 10/10 PASS |
| Official evaluation criteria | **10/10 PASS** (original 4Geeks rubric supplied 2026-11-18). **Final total 30/30.** |

Every executable check passes. The milestone is not reported as 30/30 official.

## Scope

- **Branch and base:** `feature/inventory-backoffice`, based on `feature/inventory-orm-dual-db` at `a3c4c4e` (PR #9, unmerged). PR #10 targets that base.
- **Implementation commit:** `0de523f`. The final delivery commit (this report, the outbound loading-state fix and the per-route state tests) is the PR #10 head.
- **Stack:** the existing backoffice convention (static HTML + Tailwind CDN + TypeScript ES modules + Jest). There is no Next.js app in the repository.
- **Auth reuse:** the existing `NexovaAuth` module from PR #8 (`uis/backoffice/suppliers/{src,dist}/auth-session.*`), byte-identical. There is no second login system.
- **Backend:** no backend code was changed by this milestone.

## Environment

macOS 26.6.2 · Node 24.18.0 / npm 11.16.0 · Python 3.11.17 · Docker 29.9.3 · Google Chrome 157 (headless) · PostgreSQL 16 (disposable container for E2E) · Supabase development PostgreSQL (backend live tests only, owner-authorized).

## Current results (2026-11-18, final run)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS |
| Production build | `npm run build` | PASS. The rebuilt `dist/` was byte-identical to the committed build before the outbound fix, and is rebuilt and committed with it. |
| Frontend unit/component | `npm test` | **59 collected: 54 passed, 0 failed, 5 skipped**. The skips are the live-only tests, which run inside E2E. |
| E2E (disposable stack) | `npm run e2e` | **20/20 PASS**, including the live API suite at **5/5 passed** |
| Backend offline | `cd services/api && .venv/bin/pytest -q -m "not postgres_integration"` | **55 passed** |
| Backend live PostgreSQL | `.venv/bin/pytest -q -m postgres_integration` (owner-authorized) | **5 passed**. Canonical rows, stock (IT-001 = 12, PER-001 = 17), attribution and table totals were read-only snapshotted and are identical before and after. |
| **Backend total** | | **60 passed, 0 failed, 0 skipped** |

The historical results from the first delivery (45 Jest, 20 E2E, 60 pytest) were all re-executed above rather than carried over. The 9 additional Jest tests come from `tests/route-states.test.ts`.

## Changes in this delivery (gap closure only)

1. **Fix:** on its initial load, the outbound form showed an empty, disabled selector with no loading text. It now shows "Cargando activos…" and "Cargando stock…", like the inbound form (`src/views/outbound.ts`).
2. **New tests:** `tests/route-states.test.ts` checks a loading state, a successful state with real response data, and a readable Spanish error on HTTP 500 for each of the four routes. The error check also confirms that no backend internals and no token appear on screen.

## Official rubric mapping (2026-11-18)

EVAL-01…09 were verified against the code and existing test evidence; the mapping is in the checklist.

- **EVAL-04:** the review found two unreported inbound outcomes: a 401 during submit, and a stock-refresh failure after success. Both were fixed minimally, and two regression tests were added.
- **Tests run (affected only):** `npx jest tests/inbound.test.ts tests/routes.test.ts tests/api.test.ts` gives **28 passed**. Type check, lint and build pass.
- **Not re-run:** the full suites, E2E and screenshots. Earlier full-run results stay as recorded above. The E2E flows do not exercise the two new edge paths, which are covered by the unit tests.

## EVAL-10 terminology check (2026-11-18)

- Every entity name and field label in the four views was compared with `nexova-BRIEFING.es.md`.
- One gap was found and fixed: `sku` had no label. The products and history headers now read "Activo / SKU".
- Affected tests only: `npx jest tests/terminology.test.ts tests/products.test.ts tests/history.test.ts tests/route-states.test.ts` gives **24 passed**. Type check, lint and build pass.
- The full suites and E2E were not re-run for this label-only change. E2E relies on selectors, not header text.
- Details are in the checklist.

## Backend/API evidence

- The UI uses the contracts in `services/api/app/inventory_schemas.py` exactly.
- The live suite checks against the real API:
  - Bearer login
  - a real 401 for an invalid token
  - inbound +3 and outbound −1 stock changes
  - a real 400 for insufficient stock
  - a real 422 for an allocation without an employee
- **API security boundary (Phase 6):**
  - Writes (`POST /inventory/products`, `/orders/inbound`, `/orders/outbound`) require authentication and record the TinyDB `user_uuid`.
  - `GET /inventory/products` and `GET /inventory/orders` are **intentionally public**:
    - The milestone README says GET auth is decided by the company BRIEFING ("Si los `GET` son públicos o autenticados lo define tu BRIEFING.md").
    - Nexova's BRIEFING requires no GET authentication, and its evaluator "llamará a `GET /inventory/products`" with no token.
    - PR #9 tests this explicitly (`test_product_create_initial_zero_and_public_list_detail`).
  - Requiring auth would break the established contract and possibly the evaluator, so it was **not changed**.
  - The UI never requests or renders inventory data without a session. Frontend route protection is not presented as a backend control.

## Frontend/browser evidence

Headless Chrome against the real API (`e2e-results.json`, screenshots `00-login` … `05-history` in `docs/evidence/inventory-backoffice-05/`; no new screenshots were needed):

- All four routes redirect unauthenticated users to login without rendering data.
- Login returns to the requested route.
- Products match the API, including stock levels.
- The product action preselects the inbound form; the inbound order adds +4 in the backend once, with the double submit guarded and the form reset.
- Outbound shows live stock and the client warning, then the real 400 inline, then an allocation adds −2 in the backend.
- History matches the API, is read-only, and shows names, types, timestamps and `user_uuid`.
- A reload drops the in-memory session.
- No JavaScript exceptions.

## Authentication evidence

- The JWT is held in memory by the existing `NexovaAuth` module and never written to storage or cookies (browser-verified).
- Every inventory request sends `Authorization: Bearer`.
- A missing or expired session, or an API 401, logs out and redirects to `/backoffice/login?next=…`. `next` only accepts `/backoffice/inventory/…` paths.

## Database security verification

| Check | Result | Evidence |
|---|---|---|
| Password rotated in Supabase after the 2026-11-18 terminal exposure | **PASS (owner-confirmed)** | The owner confirmed resetting the database password in the Supabase dashboard and updating the ignored `services/api/.env` (modified 2026-11-18 21:52, after the exposure). The current configuration connects. The old password was **not** tested by the agent, to avoid reusing a leaked credential. |
| `.env` tracked in Git | PASS | `services/api/.env` is ignored and appears in 0 commits across all refs. Only placeholders are in `.env.example`. |
| Credentials in Git history | PASS | Redacted scan of all refs for connection strings and Supabase hosts: 9 matching commits, all placeholder fixtures (`dev-user`, `localhost`, e2e `${pgPassword}`). The real project ref and the current password appear in 0 commits. No history rewrite is needed. |
| Secrets in this delivery | PASS | Staged-diff scan clean; `.env` / `.env*.local` ignored in the package. |
| Hosted database settings | Not modified | No credential rotation or hosted configuration change was performed by the agent. |

## Known limitations

- The in-memory session means a full page reload requires signing in again. This is deliberate: no token persistence.
- Public GET endpoints by contract (see above).
- Tailwind CDN, as on the existing supplier page; the browser logs a "not for production" notice.
- Deep links require the SPA-aware `serve.cjs`.

## Professor reproduction

**Prerequisites:** Git, Node ≥ 22, Python 3.11 with `uv`, Docker and Google Chrome (the last two only for `npm run e2e`).

```bash
git clone https://github.com/FranckDomingues/Company-Nexova-FranckDomingues.git
cd Company-Nexova-FranckDomingues && git switch feature/inventory-backoffice
cd services/api && uv sync --extra dev && cd -
cd uis/backoffice/inventory && npm ci
```

**Automated verification (no credentials needed):**

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e        # disposable PostgreSQL + real API + headless Chrome; removes everything afterwards
cd ../../../services/api && uv run pytest -q -m "not postgres_integration"
```

**Manual walkthrough:**

1. **Environment:** `cp services/api/.env.example services/api/.env`. Set `DATABASE_URL` to your own PostgreSQL / Supabase pooler URI and set a random `JWT_SECRET_KEY`. Never commit `.env`.
2. **Backend:** `cd services/api && uv run uvicorn app.main:app --port 8000`.
3. **Frontend:** `cd uis/backoffice/inventory && npm run serve`, then open `http://127.0.0.1:5500/backoffice/inventory/products`.
4. **Authentication:** create a user with `curl -X POST http://127.0.0.1:8000/users -H 'Content-Type: application/json' -d '{"email":"prof@example.com","password":"<choose-a-password>"}'`. Sign in on the redirected login page.
5. **Products and history:**
   - **Activos:** stock with Disponible / Stock bajo / Sin stock badges.
   - **Registrar entrada:** quantity + supplier; stock increases.
   - **Registrar salida:** shows the available stock; a quantity above it shows a warning, and submitting shows the server's insufficient-stock 400 next to Cantidad. A valid allocation or consumption decreases stock.
   - **Historial:** read-only list of entradas and salidas with `user_uuid`.

To create assets, use `POST /inventory/products` with a Bearer token, or the backend seed in PR #9.
