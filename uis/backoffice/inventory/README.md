# Nexova backoffice — Inventario (Hito 5)

Inventory management UI for the Nexova backoffice: activos (assets) with stock, entradas de activos
(inbound orders), salidas de activos (outbound orders) and the read-only order history. It follows the
backoffice's existing conventions (static HTML + Tailwind CDN, TypeScript modules, Jest) and reuses the
existing `NexovaAuth` login module (`../suppliers/src/auth-session.ts`).

| Route | View |
|---|---|
| `/backoffice/inventory/products` | Activos with `current_stock` and stock indicators |
| `/backoffice/inventory/orders/inbound` | Registrar entrada (POST `/inventory/orders/inbound`) |
| `/backoffice/inventory/orders/outbound` | Registrar salida (POST `/inventory/orders/outbound`) |
| `/backoffice/inventory/orders` | Historial de órdenes (GET `/inventory/orders`, read-only) |
| `/backoffice/login` | Login through the existing auth module (`?next=` returns to the requested route) |

All inventory HTTP calls go through `src/lib/inventory.ts` (Bearer token, typed contracts, readable
errors for network/400/401/403/404/422/500). Stock thresholds are documented in `src/stock.ts`.

## Run locally

```bash
# API (needs DATABASE_URL for PostgreSQL in services/api/.env, see services/api/README.md)
cd services/api && uv run uvicorn app.main:app --port 8000
# Backoffice (default API http://127.0.0.1:8000; CORS allows http://127.0.0.1:5500 by default)
cd uis/backoffice/inventory && npm ci && npm run build && npm run serve
# open http://127.0.0.1:5500/backoffice/inventory/products
```

Override the API base with `NEXOVA_API_URL=http://host:port npm run serve`.

The JWT is kept only in memory (never in `localStorage`, `sessionStorage` or cookies). Navigation
between the four routes is client-side, so the session survives; a full page reload requires signing in again.

## Verify

```bash
npm run typecheck && npm run lint && npm test   # unit/component tests (mocked fetch)
npm run build                                  # emits dist/ (committed, served as ES modules)
npm run e2e                                    # real API + PostgreSQL (Docker) + headless Chrome
```

`npm run e2e` starts a disposable PostgreSQL 16 container (TLS), the real FastAPI app with a temporary
TinyDB, creates data only through the public API, runs `tests/live.integration.test.ts` and drives the four
routes in headless Chrome. Screenshots and results go to `docs/evidence/inventory-backoffice-05/`.
It never touches the database configured in `services/api/.env`.
