# Inventory architecture and live validation

## Storage and identity

- TinyDB remains the source of truth for users, credentials, roles and JWT authentication. No user table is created in PostgreSQL and no TinyDB users are replicated.
- Supabase PostgreSQL stores SQLModel `Asset`, `AssetEntry` and `AssetExit`. `DATABASE_URL` is loaded from ignored `services/api/.env`, using the Supabase transaction pooler with TLS (`sslmode=require`). The engine is cached, but `get_db()` opens/yields/closes a request-scoped session; no global session exists.
- FastAPI lifespan imports the SQLModel tables and runs `SQLModel.metadata.create_all(engine)` when the configured URL exists. Actual table initialization and catalog checks passed on the allowlisted development database; no unrelated tables were dropped or overwritten.

## Domain model

`Asset`: integer PK, name, unique SKU, category (`hardware`, `peripherals`, `office_supplies`, `training_materials`), office (`Valencia`, `Miami`). `current_stock` is not stored.

`AssetEntry`: integer PK, FK `asset_id`, positive quantity, supplier, office, timestamp, TinyDB `user_uuid` string with no cross-database FK.

`AssetExit`: integer PK, FK `asset_id`, positive quantity, `exit_type`, optional `assigned_to`, office, timestamp and TinyDB `user_uuid`. PostgreSQL checks validate category, office, type, positive quantity, and allocation/consumption assignment semantics. Both PostgreSQL FKs, uniqueness and checks were exercised live.

Pydantic API schemas are separate from SQLModel ORM declarations in `inventory_schemas.py`.

## API and stock

Dedicated router prefix `/inventory` implements GET/POST `/products`, GET `/products/{id}`, POST `/orders/inbound`, POST `/orders/outbound`, and GET `/orders`. Briefing permits public GETs; all writes use existing TinyDB `CurrentUser`. Client UUID is ignored/rejected and never used for attribution; authenticated TinyDB identity is persisted.

Stock is `SUM(AssetEntry.quantity) - SUM(AssetExit.quantity)` per asset. Product listing uses grouped aggregate queries, and order listing uses joined queries to avoid N+1 access. Outbound locks its parent asset row with PostgreSQL `SELECT ... FOR UPDATE`, checks stock before adding an exit, and rolls back on errors. A live two-connection race produced only one allowable commit and no negative inventory.

## Seed safety and current status

The seed command requires explicit `INVENTORY_SEED_ENV=development`, a Supabase pooler host, and exact nonsecret allowlists for host/user/database. It uses only an existing active TinyDB UUID and never manufactures an identity. The live seed verification found six official assets, four entries and three exits with expected GET stocks (`NXV-IT-001=12`; `NXV-PER-001=17`) and a no-op second run. However, those pre-existing seed orders reference a UUID not found among active identities in the configured local TinyDB. They were not rewritten. Official task T17 remains BLOCKED until the authorized environment operator resolves/validates that attribution.

## Executed validation

`cd services/api && uv run --extra dev pytest -q -rs`: **55 passed, 0 skipped, 0 failed**; five tests used real PostgreSQL. Those five covered schema/FK/check/unique constraints, API persistence and stock/no-write behavior, real TinyDB login/JWT attribution, concurrent outbound requests on independent connections, and live seed counts/net stock/GET/idempotency. Full details and conservative 29-task matrix are in the test report and checklist. No secrets, URLs, or UUIDs are documented.
