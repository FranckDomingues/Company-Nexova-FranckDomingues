# INVENTORY-BACKOFFICE-05 — Hito 5 checklist (Backoffice: Interfaz de Gestión de Inventario)

- **Branch:** `feature/inventory-backoffice`
- **Base:** `feature/inventory-orm-dual-db` (PR #9)
- **PR:** #10
- **Results:** recorded on 2026-11-18 against the commit that contains this file. Details are in `INVENTORY-BACKOFFICE-05-TEST-REPORT.md`.

## Summary

| Block | Result |
|---|---|
| Development criteria (derived from the milestone brief) | **20/20 PASS** |
| Provisional engineering acceptance checks | **10/10 PASS** (provisional, not the official rubric) |
| Official evaluation criteria | **EVAL-10 PASS** (criterion text supplied by the owner on 2026-11-18); **EVAL-01…09 BLOCKED** (official text not yet supplied) |

The official score is **not** reported as 30/30. That requires the official text of EVAL-01…09, mapped one-to-one.

## How tests are labelled

- **Unit:** Jest + jsdom, mocked `fetch`.
- **Live:** `tests/live.integration.test.ts`, real FastAPI + PostgreSQL, no mocks.
- **E2E:** `npm run e2e`, headless Chrome + real API + disposable PostgreSQL. Results in `inventory-backoffice-05/e2e-results.json`.

Paths are relative to `uis/backoffice/inventory/` unless stated otherwise.

## Development criteria (20)

| ID | Criterion | Implementation | Verification | Status |
|---|---|---|---|---|
| API-1 | Centralized inventory API module. The 4 required operations go through it; views never call `fetch`. | `src/lib/inventory.ts` | Unit `api.test.ts` (paths/methods; static no-`fetch` check); Live | PASS |
| API-2 | Existing auth mechanism with `Authorization: Bearer` and no insecure storage. Unauthenticated users go through login. | `src/lib/session.ts` (adapter over the existing `NexovaAuth`), `src/main.ts` | Unit; Live (real login, real 401); E2E (no storage or cookies after use) | PASS |
| API-3 | Readable errors for network, 400, 401, 403, 404, 422 (FastAPI arrays) and 500. | `parseErrorResponse`, `ApiError` | Unit (each status, 422 fields, non-JSON 5xx, network); Live (real 400 and 422) | PASS |
| PRD-1 | Products from the API with name, SKU, category, office and `current_stock`. | `src/views/products.ts` | Unit; E2E (UI equals `GET /inventory/products` for all 6 assets) | PASS |
| PRD-2 | Distinct stock indicators with documented thresholds. | `src/stock.ts` (0 = Sin stock, 1–5 = Stock bajo, >5 = Disponible) | Unit (boundaries + badges); E2E | PASS |
| PRD-3 | Labelled inbound/outbound actions per product that keep the selection. | `?asset_id=` links + preselection | Unit; E2E | PASS |
| PRD-4 | Loading, empty, error (with retry) and success states. | `products.ts` | Unit `products.test.ts`, `route-states.test.ts` | PASS |
| IN-1 | Form posts to `POST /inventory/orders/inbound`. The selector shows names; fields follow `AssetEntryCreate`; office comes from the asset. | `src/views/inbound.ts` | Unit (exact body); Live; E2E | PASS |
| IN-2 | Client validation (required fields, positive whole quantity), submitting state and duplicate guard. | `parseQuantity`, `submitting` flag | Unit (validation blocks the POST; double submit → 1 POST); E2E (two submits → one +4) | PASS |
| IN-3 | Success confirmation, form reset and backend stock update. | `inbound.ts` | Unit; E2E (backend stock 19 → 23) | PASS |
| IN-4 | Readable HTTP 400 and 500 errors; input is kept. | `banner` + `ApiError` | Unit (400 and 500) | PASS |
| OUT-1 | Form posts to `POST /inventory/orders/outbound`. The selector shows names; allocation requires an employee, consumption sends `null`. | `src/views/outbound.ts` | Unit; Live; E2E | PASS |
| OUT-2 | `current_stock` shown before submission and reactive to product changes. Stock is refreshed after operations and shows a loading state. | `refreshStockView`, `loadAssets` | Unit; E2E (live stock 23) | PASS |
| OUT-3 | Client warning when the quantity exceeds stock. Advisory only; the server stays authoritative. | `#quantity-warning` | Unit (warning shown and the POST still sent); E2E | PASS |
| OUT-4 | Inline HTTP 400 insufficient-stock error next to quantity; success and failure states. | `setFieldError(quantity, …)` | Unit; Live; E2E (real 400 inline, then stock 23 → 21) | PASS |
| HIS-1 | All orders from `GET /inventory/orders` with product, quantity, type, timestamp and `user_uuid`. | `src/views/history.ts` | Unit; Live; E2E (UI rows = API orders) | PASS |
| HIS-2 | Product names from API data (`asset_name`, then the products list); never invented. | `resolveAssetName` | Unit | PASS |
| HIS-3 | Entradas and salidas visually distinguished. | ↓Entrada / ↑Salida badges, accent, +/− | Unit; E2E | PASS |
| HIS-4 | Read-only, with loading, empty and error states. | `history.ts` | Unit (no controls, GET only, states); E2E (0 controls) | PASS |
| AUTH-1 | All four routes require authentication and redirect to `/backoffice/login?next=…` without fetching or rendering data. Integrated into the backoffice navigation. | `src/app.ts`, `index.html`, `../index.html` | Unit (4 routes, 401 during use, logout, open-redirect guard); E2E (4 routes in Chrome) | PASS |

## Provisional engineering acceptance checks (10)

These are **provisional engineering checks defined for this delivery**. They are **not** quotations of the official 4Geeks Academy rubric, and the official column stays BLOCKED until that text is supplied.

| ID | Provisional check | Mapped evidence | Provisional result | Official rubric result |
|---|---|---|---|---|
| EVAL-01 | Real inventory API integration | API-1; live suite 5/5; E2E (UI vs API comparisons) | PASS | BLOCKED |
| EVAL-02 | Authentication and protected routes | API-2, AUTH-1; E2E 4 redirects + login return + no token persisted | PASS | BLOCKED |
| EVAL-03 | Product listing and stock visualization | PRD-1…4; `01-products.png` | PASS | BLOCKED |
| EVAL-04 | Inbound orders correctly increase stock | IN-1…3; E2E 19 → 23 in the backend; live suite | PASS | BLOCKED |
| EVAL-05 | Outbound orders correctly decrease stock | OUT-1, OUT-4; E2E 23 → 21; live suite | PASS | BLOCKED |
| EVAL-06 | Insufficient-stock handling and server-side enforcement | OUT-3/4; real HTTP 400 in live + E2E; the client warning never blocks the request | PASS | BLOCKED |
| EVAL-07 | Read-only inventory movement history | HIS-1…4; `05-history.png` | PASS | BLOCKED |
| EVAL-08 | Form validation and readable HTTP errors | API-3, IN-2, IN-4; real 422 in the live suite | PASS | BLOCKED |
| EVAL-09 | Type checking, lint, build and automated tests | Test report: typecheck/lint/build PASS; Jest 54 passed; E2E 20/20; pytest 60 passed | PASS | BLOCKED |
| EVAL-10 | Navigation integration, documentation and reproducibility | Supplier-page nav link; `inventory/README.md`; reproduction section; self-contained `npm run e2e` | PASS | Superseded by the official EVAL-10 below |

## Official evaluation criteria

Only criteria whose official text has been supplied are mapped. **No criterion text is inferred.**

| ID | Official criterion (as supplied) | Result | Evidence |
|---|---|---|---|
| EVAL-01 … EVAL-09 | Text not supplied | BLOCKED | Supporting evidence is in the provisional checks above, but it is not attributed to the official rubric. |
| EVAL-10 | "All inventory interface entity names and field labels must match `company-BRIEFING.md`." | **PASS** | See the verification below. |

### EVAL-10 verification

**Source.** The repository contains no file literally named `company-BRIEFING.md`. Nexova's company briefing is `docs/evidence/sources/nexova-BRIEFING.es.md` (source path `05-backend-inventory-orm/nexova-BRIEFING.md`; English twin `nexova-BRIEFING.en.md`). Its entity and field specification is in lines 30–64.

**Entities.**

| Briefing | UI label | Where |
|---|---|---|
| `Asset` ("activos") | Activo / Activos | `src/terms.ts`, `products.ts`, nav in `index.html` |
| `AssetEntry` ("entrada de activos") | Entrada de activos / Entrada | `inbound.ts`, `history.ts` |
| `AssetExit` ("salida de activos") | Salida de activos / Salida | `outbound.ts`, `history.ts` |

No generic "Producto/Product" or "Inbound/Outbound" label appears; `tests/terminology.test.ts` asserts this.

**Fields.**

| Briefing field | UI label | Where |
|---|---|---|
| `name` | asset name in the "Activo / SKU" column and the selector | `products.ts`, `history.ts`, `forms.ts` |
| `sku` ("Código único") | **SKU** in the "Activo / SKU" header | `products.ts`, `history.ts` |
| `category` | Categoría | `products.ts` |
| `office` ("oficina receptora" for entries) | Oficina / Oficina receptora | `products.ts`, `inbound.ts`, `history.ts` |
| `current_stock` ("stock actual") | Stock actual / Stock disponible | `products.ts`, `outbound.ts` |
| `quantity` ("Unidades recibidas") | Cantidad (unidades recibidas) / Cantidad (unidades) | `inbound.ts`, `outbound.ts`, `history.ts` |
| `supplier` ("Nombre del proveedor o vendedor") | Proveedor | `inbound.ts`, `history.ts` |
| `exit_type` ("allocation": asignado a empleado / "consumption") | Tipo de salida: Asignación a empleado / Consumo | `outbound.ts`, `history.ts` |
| `assigned_to` ("Nombre o ID del empleado") | Empleado asignado, placeholder "Nombre o ID del empleado" | `outbound.ts` |
| `created_at` | Fecha (the briefing gives no Spanish label) | `history.ts` |
| `user_uuid` ("UUID del responsable que registró …") | Registrado por (UUID) | `history.ts` |

**Correction made.** `sku` was displayed but never labelled. The products and history headers changed from "Activo" to "Activo / SKU" (`src/terms.ts`, `src/views/products.ts`, `src/views/history.ts`). No backend contract changed.

**Note on category values.** The briefing lists `category` values as codes (`hardware`, `peripherals`, `office_supplies`, `training_materials`). The UI shows them as Spanish display values (Hardware, Periféricos, Material de oficina, Material de formación); the field label "Categoría" matches. These are values, not field labels, so they were left unchanged.

**Tests.** `tests/terminology.test.ts` (extended), `products.test.ts`, `history.test.ts` and `route-states.test.ts`: **24 passed**. Type check, lint and build pass.

**Screenshots.** `01-products.png` and `05-history.png` predate this label change (their header reads "Activo"). They were not regenerated.

## Totals

- **Development:** 20/20 PASS.
- **Provisional acceptance:** 10/10 PASS.
- **Official evaluation:** EVAL-10 PASS; EVAL-01…09 BLOCKED pending their official text.
- **Verified official total:** **21/30** (20 task criteria + EVAL-10). The other 9 are BLOCKED, not FAIL.

No criterion is counted twice.
