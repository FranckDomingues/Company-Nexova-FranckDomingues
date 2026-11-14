# Professor reproduction guide

## Local suite

1. From repository root, enter `services/api`.
2. Install dependencies with `uv sync --extra dev`.
3. Run the complete suite: `uv run --extra dev pytest -q -rs`.
4. Current observed run: **55 passed, 0 skipped, 0 failed**, including five real PostgreSQL tests. Without live-test configuration, the PostgreSQL tests are expected to skip and must not be called live evidence.

## Secure live PostgreSQL setup

1. Use only the explicitly authorized, isolated Nexova development Supabase project. In the dashboard, copy **Connect → Transaction pooler → URI**. Do not use production or a shared database.
2. Copy `services/api/.env.example` to ignored `services/api/.env`; put the connection URI there only as `DATABASE_URL`. TLS is required (`sslmode=require`). Never place credentials in source, chat, terminal arguments, logs, commits or PR text.
3. Add explicit `INVENTORY_TEST_ENV=development`, `INVENTORY_POSTGRES_TESTS=1`, and exact `INVENTORY_TEST_ALLOWED_DATABASE_HOST`, `INVENTORY_TEST_ALLOWED_DATABASE_USER`, `INVENTORY_TEST_ALLOWED_DATABASE_NAME` values that match the URL's host, username and database. The fixture fails closed if the file is not Git-ignored or the allowlist differs.
4. For seed test only, additionally set `INVENTORY_SEED_ENV=development` and exact `INVENTORY_SEED_ALLOWED_DATABASE_HOST`, `INVENTORY_SEED_ALLOWED_DATABASE_USER`, `INVENTORY_SEED_ALLOWED_DATABASE_NAME`. Never run the seed against anything other than the approved isolated dev DB.
5. Run `uv run --extra dev pytest -q -rs tests/test_inventory_postgres.py`. Tests create uniquely named disposable rows; cleanup only targets those rows. They do not drop/truncate tables. SQLModel `create_all` is additive. Never clear or alter existing seed records as a test shortcut.
6. For an actual professor demo seed, ensure an existing authorized active TinyDB user is available and that canonical seed rows are attributed to an authorized UUID. Current existing PostgreSQL seed orders' UUID did not match an active user in the configured local TinyDB; this is explicitly unresolved. Do not invent user identity or silently rewrite existing records. Coordinate with the DB owner before resolving.
7. Run the full suite after live tests. Review `INVENTORY-ORM-01-CHECKLIST.md` and test report: currently 28/29 official tasks PASS, T17 BLOCKED on seed attribution.

The live concurrency test runs two simultaneous requests, verifies distinct PostgreSQL backend PIDs, and asserts one allowed commit, one HTTP 400, and nonnegative final stock. This is PostgreSQL evidence, not SQLite simulation.
