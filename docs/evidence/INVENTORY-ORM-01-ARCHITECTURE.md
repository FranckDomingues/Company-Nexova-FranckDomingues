# Inventory architecture and final validation

## Storage and identity

- TinyDB remains the sole owner of users, credentials, roles and JWT authentication. No PostgreSQL user table exists and no user replication is used.
- Supabase PostgreSQL stores SQLModel `Asset`, `AssetEntry` and `AssetExit`. `DATABASE_URL` is read from ignored `services/api/.env`, using the transaction pooler and TLS (`sslmode=require`). The cached engine is shared, while `get_db()` yields a request-scoped session; no global session is held.
- FastAPI startup imports the registered models and runs `SQLModel.metadata.create_all(engine)` when PostgreSQL is configured.

## Domain and API

`Asset` has an integer primary key, name, unique SKU, category and office; it does not persist `current_stock`. `AssetEntry` and `AssetExit` reference assets through PostgreSQL foreign keys, enforce positive quantities and domain constraints, carry creation timestamps, and store TinyDB `user_uuid` as a string without cross-database FK.

Independent Pydantic schemas are in `inventory_schemas.py`. The `/inventory` router exposes all six required endpoints. GET operations follow the briefing policy; all writes use existing TinyDB authentication. Order attribution always comes from the authenticated identity. Order listings use joins, and product listing aggregates to avoid N+1 queries.

Stock is calculated as `SUM(AssetEntry.quantity) - SUM(AssetExit.quantity)` per asset, with office consistency enforced. Outbound operations lock the asset row in PostgreSQL, check available quantity before writing, and roll back on failure to prevent overselling.

## Seed safety and T17

The canonical development seed requires `INVENTORY_SEED_ENV=development` and exact development database allowlists. It obtains an active identity from the persistent application TinyDB and refuses temporary identity stores. It is idempotent. The authorized T17 repair (details in `INVENTORY-ORM-07-FINAL-ACCEPTANCE.md`) replaced only the seven canonical order rows after backup; unrelated inventory rows remained unchanged. The resulting canonical records use a persistent active TinyDB identity.

## Final verification

On 2026-11-18, `cd services/api && uv run --extra dev pytest -q -rs` completed with **60 passed, 0 failed, 0 skipped**, including five real PostgreSQL tests. Coverage included database constraints and FKs, all six endpoints, TinyDB login-to-PostgreSQL order attribution, rejected oversell/no-write behavior, concurrent outbound requests on independent PostgreSQL sessions, and seed counts/net stock/GET/idempotency. Canonical stock includes `NXV-IT-001=12` and `NXV-PER-001=17`.

Official traceability: **29/29 PASS**, documented in `INVENTORY-ORM-01-CHECKLIST.md`. No secrets, full connection strings, user identities, TinyDB files or repair backups are included in this repository evidence.
