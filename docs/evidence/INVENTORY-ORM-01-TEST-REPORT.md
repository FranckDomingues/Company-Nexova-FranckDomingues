# INVENTORY-ORM-01 — Test report

## Executed

Command: `cd services/api && uv run pytest -q`

Result: **45 passed, 0 failed** (one upstream Starlette/httpx deprecation warning).
- Existing auth/supplier/database tests: 34 passed.
- New isolated inventory API, ORM, seed idempotence and relationship tests: 11 passed.
- Test persistence: SQLite in-memory via SQLModel solely as an isolated test double. It does not verify PostgreSQL semantics or establish Supabase connectivity.

Covered: all six routes; initial-zero/derived stock; SKU uniqueness; validation of category/office/quantity/assignment; office consistency; not-found; authenticated UUID attribution; missing auth; invalid exit no-write and exact error; foreign-key metadata/no PostgreSQL users table; response fields; order query count <=2.

## Not verified / blocked

- No `services/api/.env` or `DATABASE_URL` exists in this checkout. No live Supabase/PostgreSQL test was run.
- PostgreSQL `SELECT ... FOR UPDATE` behavior under two simultaneous transactions, production schema initialization, live foreign-key/check constraints, and seed execution are unverified.
- Concurrency test is pending live PostgreSQL. SQLite ignores PostgreSQL row-level locking and is not presented as equivalent proof.
- Seed command tests with a real TinyDB UUID in the isolated development DB are pending; no user or Supabase data was created.

The official 29-item status matrix is `INVENTORY-ORM-01-CHECKLIST.md`.
