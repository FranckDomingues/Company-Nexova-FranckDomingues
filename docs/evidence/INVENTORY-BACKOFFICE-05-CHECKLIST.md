# INVENTORY-BACKOFFICE-05 — Hito 5 checklist (Backoffice: Interfaz de Gestión de Inventario)

Branch `feature/inventory-backoffice` (based on `feature/inventory-orm-dual-db`, PR #9).

## Source of criteria

The official 30-criterion Hito 5 rubric text was **not available** in the repository or in the task. The 20 task criteria below are derived one-to-one from the milestone brief's task groups:

| Group | Criteria |
|---|---|
| API integration | 3 |
| Product page | 4 |
| Inbound form | 4 |
| Outbound form | 4 |
| Order history | 4 |
| Route protection | 1 |

The **10 evaluation criteria are BLOCKED** until the rubric text is supplied. They are not invented here.

Paths are relative to `uis/backoffice/inventory/` unless stated otherwise.

## How tests are labelled

- **Unit:** Jest + jsdom, mocked `fetch`.
- **Live:** `tests/live.integration.test.ts`, real FastAPI + PostgreSQL, no mocks.
- **E2E:** headless Chrome against the real stack; results in `docs/evidence/inventory-backoffice-05/e2e-results.json`.

## Task criteria (20)

| ID | Criterion | Implementation | Verification | Evidence | Status |
|---|---|---|---|---|---|
| API-1 | Centralized inventory API module. The 4 required operations go through it; views never call `fetch`. | `src/lib/inventory.ts` | Unit `api.test.ts` (paths/methods; static check that no view calls `fetch`); Live | 45/45 unit; live 5/5 | PASS |
| API-2 | Existing auth mechanism with `Authorization: Bearer` and no insecure storage. Unauthenticated users go through login. | `src/lib/session.ts` (adapter over the existing `NexovaAuth`), `src/main.ts` | Unit (Bearer on every call; no session → no request + login); Live (real login, real 401); E2E (no `localStorage`/`sessionStorage`/cookie after use) | e2e "full reload drops the in-memory session" PASS | PASS |
| API-3 | Readable errors for network, 400, 401, 403, 404, 422 (FastAPI arrays) and 500. | `parseErrorResponse`, `ApiError` | Unit (each status; 422 field mapping; non-JSON 5xx; network); Live (real 400 and 422) | `api.test.ts`, live suite | PASS |
| PRD-1 | Products are fetched from the API, showing name, SKU, category, office and `current_stock`. | `src/views/products.ts` | Unit `products.test.ts`; E2E (UI equals `GET /inventory/products` for all 6 assets) | `01-products.png` | PASS |
| PRD-2 | Visually distinct stock indicators with documented thresholds. | `src/stock.ts` (0 = Sin stock, 1–5 = Stock bajo, >5 = Disponible), badges, legend | Unit (threshold boundaries + badges); E2E (levels match API values) | `01-products.png` | PASS |
| PRD-3 | Labelled inbound/outbound actions per product that keep the selection. | `?asset_id=` links, form preselection | Unit (click → route + preselected); E2E (preselect in the real browser) | `products.test.ts`, e2e | PASS |
| PRD-4 | Loading, empty, error (with retry) and success states. | `products.ts` | Unit (all four states) | `products.test.ts` | PASS |
| IN-1 | Inbound form posts to `POST /inventory/orders/inbound`. The selector shows names; required fields match `AssetEntryCreate`; office comes from the asset. | `src/views/inbound.ts` | Unit (exact request body); Live; E2E | `02-inbound-success.png` | PASS |
| IN-2 | Client-side validation, a submitting state and a duplicate-submission guard. | `parseQuantity`, `submitting` flag, disabled button | Unit (validation blocks the POST; double submit → 1 POST); E2E (two `requestSubmit` → stock +4 once) | e2e "succeeds once" PASS | PASS |
| IN-3 | Success confirmation and form reset. Stock is updated in the backend. | `inbound.ts` | Unit (message, refetch, reset); E2E (backend stock 19 → 23) | e2e, `02-inbound-success.png` | PASS |
| IN-4 | Readable HTTP 400 and 500 errors; input is kept. | `banner` + `ApiError` | Unit (400 and 500 cases) | `inbound.test.ts` | PASS |
| OUT-1 | Outbound form posts to `POST /inventory/orders/outbound`. The selector shows names; exit type and employee follow `AssetExitCreate` (allocation needs an employee, consumption sends null). | `src/views/outbound.ts` | Unit; Live; E2E | `04-outbound-success.png` | PASS |
| OUT-2 | The selected product's `current_stock` is shown before submission and updates when the product changes. Stock is refreshed after operations. | `refreshStockView`, `loadAssets` after a 400 or success | Unit (reactive change; refresh after 400); E2E (shows live stock 23) | `03-outbound-insufficient-stock.png` | PASS |
| OUT-3 | Client warning when the quantity exceeds stock. It is advisory only; the server stays authoritative. | `#quantity-warning` | Unit (warning shown and the POST still sent); E2E | `03-…png` | PASS |
| OUT-4 | Inline HTTP 400 insufficient-stock error next to quantity; success and failure states. | `setFieldError(quantity, …)` | Unit; Live (real 400 inline); E2E (real 400 inline, then allocation success, stock 23 → 21) | `03-…png`, `04-…png` | PASS |
| HIS-1 | History of all orders from `GET /inventory/orders` with product, quantity, type, timestamp and `user_uuid`. | `src/views/history.ts` | Unit; Live; E2E (UI rows = API orders, 12/12) | `05-history.png` | PASS |
| HIS-2 | Product names come from API data (`asset_name`, falling back to the products list); never invented. | `resolveAssetName` | Unit (both sources; explicit "sin datos" label when unknown) | `history.test.ts` | PASS |
| HIS-3 | Entradas and salidas are visually distinguished. | Badge ↓Entrada / ↑Salida, coloured accent, +/− quantities | Unit; E2E | `05-history.png` | PASS |
| HIS-4 | Read-only (no edit/delete), with loading, empty and error states. | `history.ts` | Unit (no form/button/input; only GET calls); E2E (0 controls) | e2e PASS | PASS |
| AUTH-1 | All four routes require authentication and redirect to login (`?next=` back to the route), without fetching or rendering protected data. Integrated into the backoffice navigation. | `src/app.ts` (`PROTECTED_ROUTES`, `safeNextPath`), `index.html`, `../index.html` nav link | Unit (4 routes, no requests, return after login, 401 during use, logout, open-redirect guard); E2E (4 routes in Chrome) | e2e 4× PASS, `00-login.png` | PASS |

## Evaluation criteria (10)

| ID | Criterion | Status |
|---|---|---|
| EVAL-1 … EVAL-10 | Rubric text not supplied. Supporting evidence exists (see the test report): build, type check, lint, tests, real API integration, browser smoke, terminology and accessibility labels. It cannot be mapped to specific criteria without the rubric. | BLOCKED |

## Totals

**20/30 PASS · 0 FAIL · 10 BLOCKED.** No criterion is counted twice.
