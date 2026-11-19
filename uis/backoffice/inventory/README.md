# Nexova backoffice — Inventario (Hito 5) and authentication (AUTH-02)

Inventory management UI for the Nexova backoffice: activos (assets) with stock, entradas de activos
(inbound orders), salidas de activos (outbound orders) and the read-only order history. It follows the
backoffice's existing conventions (static HTML + Tailwind CDN, TypeScript modules, Jest) and reuses the
single `NexovaAuth` auth module (`../suppliers/src/auth-session.ts`), which also powers the AUTH-02
login, registration and profile views.

| Route | View |
|---|---|
| `/backoffice/inventory/products` | Activos with `current_stock` and stock indicators |
| `/backoffice/inventory/orders/inbound` | Registrar entrada (POST `/inventory/orders/inbound`) |
| `/backoffice/inventory/orders/outbound` | Registrar salida (POST `/inventory/orders/outbound`) |
| `/backoffice/inventory/orders` | Historial de órdenes (GET `/inventory/orders`, read-only) |
| `/backoffice/account/profile` | Mi perfil: `GET /auth/me`, `PUT /profiles/me` (AUTH-02) |
| `/backoffice/login` | Login (`POST /auth/login`); `?next=` returns to the requested route. Public, guest-only |
| `/backoffice/register` | Registration (`POST /users` → `POST /auth/login`). Public, guest-only |

`/login`, `/register` and `/account/profile` redirect to the routes above. Every other route is protected by
the client-side guard in `src/app.ts`, which checks for a token and validates it with `GET /auth/me`. See
[`docs/evidence/AUTH-02-ROUTE-MATRIX.md`](../../../docs/evidence/AUTH-02-ROUTE-MATRIX.md).

All protected HTTP calls go through the shared client `src/lib/http.ts` (Bearer token, readable errors for
network/400/401/403/404/422/500, 401 → session cleared and redirect to login), used by `src/lib/inventory.ts`
and `src/lib/account.ts`. Stock thresholds are documented in `src/stock.ts`.

## Run locally

```bash
# API (needs DATABASE_URL for PostgreSQL in services/api/.env, see services/api/README.md)
cd services/api && uv run uvicorn app.main:app --port 8000
# Backoffice (default API http://127.0.0.1:8000; CORS allows http://127.0.0.1:5500 by default)
cd uis/backoffice/inventory && npm ci && npm run build && npm run serve
# open http://127.0.0.1:5500/backoffice/inventory/products
```

Override the API base with `NEXOVA_API_URL=http://host:port npm run serve`.

Since AUTH-02 the JWT is stored in `localStorage` under `nexova.auth.token`, as the assignment requires, so a
reload keeps the session. The stored token is re-validated with `GET /auth/me` before any private view renders.
See the XSS note in `docs/evidence/AUTH-02-CHECKLIST.md`.

## Verify

```bash
npm run typecheck && npm run lint && npm test   # unit/component tests (mocked fetch)
npm run build                                  # emits dist/ + ../suppliers/dist/auth-session.js (committed)
npm run e2e                                    # real API + PostgreSQL (Docker) + headless Chrome
npm run e2e:auth                               # same run, evidence to docs/evidence/auth-02/
```

`npm run e2e` starts a disposable PostgreSQL 16 container (TLS), the real FastAPI app with a temporary
TinyDB, creates data only through the public API, runs `tests/live.integration.test.ts` and drives the four
routes and the AUTH-02 flows in headless Chrome. Screenshots and results go to `docs/evidence/inventory-backoffice-05/`
(`npm run e2e`) or `docs/evidence/auth-02/` (`npm run e2e:auth`).
It never touches the database configured in `services/api/.env`.
