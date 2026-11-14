# Reproduction guide

## Local/offline checks

1. From repository root: `cd services/api`.
2. Install/sync: `uv sync --extra dev`.
3. Run isolated regression suite: `uv run pytest -q`.
4. Run API: configure a local TinyDB path and JWT secret; inventory startup/schema creation activates only when `DATABASE_URL` is set.

## Supabase development verification (currently blocked here)

1. In Supabase dashboard, select **Connect → Transaction pooler → URI**. Use a dedicated isolated development project/database, never production.
2. Copy `services/api/.env.example` to `services/api/.env` locally. It is Git-ignored. Put the transaction-pooler URI (normally port 6543) only in `DATABASE_URL`; TLS is enforced as `sslmode=require`. Do not paste credentials into chat, PR text, logs, or shell commands.
3. Set a local disposable `SUPPLIER_DB_PATH` and strong `JWT_SECRET_KEY`.
4. For live tests, explicitly set `INVENTORY_TEST_ENV=development`, `INVENTORY_POSTGRES_TESTS=1`, and exact allowlists `INVENTORY_TEST_ALLOWED_DATABASE_HOST`, `INVENTORY_TEST_ALLOWED_DATABASE_USER`, `INVENTORY_TEST_ALLOWED_DATABASE_NAME`; the three must match `DATABASE_URL` identity parts. The tests require a `*.pooler.supabase.com` host. Run `cd services/api && uv run --extra dev pytest -q tests/test_inventory_postgres.py`. The test suite creates uniquely named rows, has no truncate/drop cleanup, and hides connection error details.
5. Before seeding, first register a real test account through `/users` and verify a stable UUID exists in TinyDB. Do not invent or manually fabricate an identity.
6. Seeding now fails closed unless `INVENTORY_SEED_ENV=development` is explicit and all three exact target identity allowlists are set in ignored `.env`: `INVENTORY_SEED_ALLOWED_DATABASE_HOST`, `INVENTORY_SEED_ALLOWED_DATABASE_USER`, and `INVENTORY_SEED_ALLOWED_DATABASE_NAME`. Each must exactly match the parsed host/user/database of `DATABASE_URL`, and host must be a Supabase pooler host. Run `cd services/api && uv run --extra dev pytest -q tests/test_inventory_postgres.py -k seed` for repeatable live verification. Do not run seed against a shared or production database.
7. Live seed test verifies six assets, four entries, three exits, expected net stock, same TinyDB UUID attribution, and a zero-insert second execution. It skips unless the explicit seed configuration is present.
8. Full live suite includes separate-connection concurrency checks; require exactly one accepted and one insufficient-stock result from two 4-unit exits against five units, with one order committed and final stock one.
9. Clean up only uniquely tagged test assets created by tests. The seed test intentionally preserves seeded demo data for verification; dispose/reset only after confirming the project is isolated.

## Authentication contract

Writes use existing TinyDB JWT `get_current_user`. New registrations get a stable UUID; existing users lacking it receive a UUID lazily on authenticated access. GET routes are public as the Nexova briefing imposes no GET-auth requirement.
