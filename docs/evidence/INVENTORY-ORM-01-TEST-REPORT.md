# INVENTORY-ORM-01 — Test report (updated for INVENTORY-ORM-03)

## Current execution

Command: `cd services/api && uv run --extra dev pytest -q -rs`
Result: **50 passed, 5 skipped, 0 failed** (55 collected); one upstream Starlette/httpx deprecation warning. The five tests were skipped because `services/api/.env` is absent. The live PostgreSQL marker is registered in `pyproject.toml`.

- Existing regression tests: **34 passed**.
- Offline inventory, seed-safety, and configuration tests: **16 passed**.
- Opt-in real PostgreSQL tests collected: **5 skipped**. These cover table/constraint checks, live API stock persistence, real TinyDB login to PostgreSQL order attribution, two-connection concurrency, and live authorized seed verification.
- The final run was executed after adding a test fixture that removes ambient shell `DATABASE_URL` for non-PostgreSQL tests. No PostgreSQL test was executed. No live test result is inferred from SQLite.

## Local verification

The isolated test double covers all six routes, derived stock, validation, UUID attribution through an overridden identity, missing auth, office consistency, exact insufficient-stock message/no-write, metadata FKs, order response query count, and seed algorithm/idempotence. Seed-safety tests verify that an absent `INVENTORY_SEED_ENV` fails closed and that development host/user/database allowlists must exactly match parsed `DATABASE_URL` identity components.

## Live PostgreSQL status

- `services/api/.env` is absent; no `DATABASE_URL` was read from a local file, and no live PostgreSQL test ran.
- Actual TinyDB login-to-order attribution: **BLOCKED** (the real TinyDB + PostgreSQL integration test is present but skipped).
- PostgreSQL table/FK/check/unique constraints and computed stock persistence: **BLOCKED**.
- Two independent PostgreSQL connections and concurrent outbound race: **BLOCKED**; SQLite locking is not evidence.
- Live idempotent seed and exact seeded records/net stock: **BLOCKED**.
- Supabase startup DDL/connectivity: **BLOCKED**.

The authoritative checklist has exactly 29 official tasks. Current evidence-based summary: **17 PASS / 12 BLOCKED**; see `INVENTORY-ORM-01-CHECKLIST.md`. The PASS label is limited to local implementation verification and does not imply full official acceptance.
