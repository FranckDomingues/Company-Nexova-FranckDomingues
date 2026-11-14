# Inventory architecture

## Storage and identity

- TinyDB remains the source of truth for users, credentials, roles, and JWT authentication. New registration stores `user_uuid`; pre-existing active accounts get a UUID lazily when authenticated. No user is copied to PostgreSQL.
- Supabase PostgreSQL stores `Asset`, `AssetEntry`, and `AssetExit` through SQLModel. `DATABASE_URL` is read from ignored `.env`, validated as PostgreSQL, and TLS is required (`sslmode=require`). Supabase transaction pooler URI is expected. There is no database session global: `get_db()` yields/closes a request-scoped session.
- When configured, FastAPI lifespan imports/registers inventory models before `SQLModel.metadata.create_all(engine)`. This is learning/development initialization only, not recommended as a production migration strategy. When no URL is configured the existing non-inventory app/regression tests remain usable; live inventory access necessarily fails without DB config.

## Domain model

`Asset` has `id`, `name`, unique `sku`, `category`, `office`; `current_stock` is never a database field. `AssetEntry` and `AssetExit` have required PostgreSQL FKs to `inventory_assets.id`, positive quantity checks, timestamps, office, and un-FK'd `user_uuid` string. Check constraints encode allowed offices/categories/exit types and assignment semantics. These classes use SQLModel `table=True`; Pydantic API schemas are in separate `inventory_schemas.py`.

## Routes and stock

Dedicated `/inventory` router implements GET products/list, POST product, GET product detail, POST inbound, POST outbound, GET orders. GET is public according to Nexova briefing; all writes use the existing TinyDB `CurrentUser`. Client UUIDs/stock fields are forbidden/ignored by request validation, and attribution comes from the current TinyDB record. Order office must match asset office.

Stock is `SUM(AssetEntry.quantity) - SUM(AssetExit.quantity)` for the asset. List view uses grouped aggregates, and order listing uses two joined queries rather than per-order relationship access. Outbound locks the parent asset row with PostgreSQL `FOR UPDATE`, checks stock before adding an exit, then commits; exceptions rollback. This serialization strategy requires real PostgreSQL verification; SQLite test fixtures do not exercise row locks.

## Development seed safety

`app.inventory_seed.seed_inventory()` inserts the exact six assets, four entries, and three exits and only uses an existing active TinyDB UUID; it never creates/guesses users. It now **fails closed** unless `INVENTORY_SEED_ENV=development` is explicitly present (unset is not consent). It also requires `DATABASE_URL` to identify a Supabase transaction-pooler host and requires exact nonsecret allowlist matches for `INVENTORY_SEED_ALLOWED_DATABASE_HOST`, `INVENTORY_SEED_ALLOWED_DATABASE_USER`, and `INVENTORY_SEED_ALLOWED_DATABASE_NAME`. No operation can proceed from an env-label alone. Idempotence matches asset/order facts, not a client-provided user. Local seed safety tests exercise the gate; live seeding is separately opt-in and protected by the same checks.

## Live integration tests

`tests/test_inventory_postgres.py` contains five PostgreSQL-only integration tests. They skip unless ignored `services/api/.env` has `INVENTORY_POSTGRES_TESTS=1`, a PostgreSQL transaction-pooler `DATABASE_URL`, and an exact `INVENTORY_TEST_ALLOWED_DATABASE_HOST` match. The suite never substitutes SQLite, never drops tables/truncates data, uses unique test SKUs, suppresses exception strings that could reveal credentials, and tests real schema/FK/check/unique behavior, DB-backed stock/order persistence, actual temporary TinyDB registration/login/UUID attribution, concurrent outbound calls over two independent `pg_backend_pid()` connections, and allowlisted seed idempotence.

## Verification status

Latest suite: 50 passed, 5 PostgreSQL tests skipped, 0 failed. Local inventory application tests use isolated in-memory SQLite only. The local TinyDB authentication route remains covered by regression tests, but the required TinyDB-to-real-PostgreSQL order test is not executed. No Supabase URL is configured, so PostgreSQL DDL/constraints, order persistence, live seed, and concurrency are BLOCKED. No live Supabase PASS is claimed. Exact 29-task matrix is 20 PASS / 9 BLOCKED, with live/database items explicitly blocked.
