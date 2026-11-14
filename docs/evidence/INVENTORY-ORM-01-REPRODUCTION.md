# Reproduction guide

## Local/offline checks

1. From repository root: `cd services/api`.
2. Install/sync: `uv sync --extra dev`.
3. Run isolated regression suite: `uv run pytest -q`.
4. Run API: configure a local TinyDB path and JWT secret; inventory startup/schema creation activates only when `DATABASE_URL` is set.

## Supabase development verification (currently blocked here)

1. In Supabase dashboard, select **Connect → Transaction pooler → URI**. Use a dedicated isolated development project/database, not production.
2. Create `services/api/.env` locally (it is ignored by Git) and set `DATABASE_URL` to that transaction-pooler URI (usually port 6543). Do not paste it into chat, issue/PR text, logs, or shell command arguments. Existing `sql_database.py` requires PostgreSQL and enforces `sslmode=require`.
3. Set `SUPPLIER_DB_PATH` to a disposable local TinyDB JSON file and a strong local `JWT_SECRET_KEY`. Never reuse production credentials.
4. Register a test account using `/users`; registration creates its UUID in TinyDB. Do not seed imaginary users.
5. Start the API once to initialize `Asset`, `AssetEntry`, and `AssetExit` tables in the isolated database. Verify connection first in a non-destructive manner.
6. With `INVENTORY_SEED_ENV=development`, run from `services/api`: `uv run python -c 'from app.inventory_seed import seed_inventory; print(seed_inventory())'`. The seed command refuses to fabricate users and is idempotent.
7. Verify six SKUs, four-plus entries, three-plus exits, and `GET /inventory/products` net stock. Verify `NXV-IT-001` net 12 after entries 10+5 minus allocation 2 and consumption 1; `NXV-PER-001` net 17 after 20 minus allocation 3.
8. Run authorized live integration tests, including concurrent exits against one asset; record the sanitized host/project identifier and outcome only. Never output the connection string.
9. Remove/dispose the dedicated development data only after verification, with explicit confirmation of the isolated project.

## Authentication contract

Writes use existing TinyDB JWT `get_current_user`. New registrations get a stable UUID; existing users lacking it receive a UUID lazily on authenticated access. GET routes are public as the Nexova briefing imposes no GET-auth requirement.
