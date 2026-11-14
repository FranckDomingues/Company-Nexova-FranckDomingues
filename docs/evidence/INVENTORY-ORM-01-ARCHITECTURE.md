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

## Development seed

`app.inventory_seed.seed_inventory()` inserts six exact assets, four entries and three exits, associated only with an existing active TinyDB user UUID. It is limited to `INVENTORY_SEED_ENV=development`, uses unique SKU and order match keys for idempotence, and does not invent a user. See reproduction steps.

## Verification status

44 local tests pass (34 retained and 10 inventory). These use isolated in-memory SQLite for inventory route/ORM behavior. Supabase connectivity, SQLModel live DDL, live seeds, and PostgreSQL concurrency remain BLOCKED because no authorized `DATABASE_URL` is configured. No live Supabase PASS is claimed.
