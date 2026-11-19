# INVENTORY-ORM-07 — Authorized seed repair and final acceptance

Date: 2026-11-18. Branch `feature/inventory-orm-dual-db`, PR #9 (not merged).

## Verdict

- **T17: PASS.** Verified directly against the live development database.
- **Official acceptance: 29/29 PASS** at requirement level.
- **One verification gap remains open.** The 5 live PostgreSQL integration tests were **not rerun** after this change; they are reported as skipped below. The live-test opt-in and allowlist in the ignored `services/api/.env` are disabled, and populating them was left to the database owner rather than done by the agent. The milestone should be considered closed only after those 5 tests pass (see "Remaining action").

## 1. Authorized scope

The database owner authorized a backup, then replacement of **only** the seven identified canonical inventory orders (4 AssetEntries, 3 AssetExits) in the development Supabase project. No other records were in scope, and the PR is not to be merged.

## 2. Target verification (PASS)

- Seed allowlist (host, user, database) matches `DATABASE_URL` exactly; `INVENTORY_SEED_ENV=development`. `current_database()` matches the URL.
- Tables `inventory_assets`, `inventory_asset_entries`, `inventory_asset_exits` are present.
- Dependencies:
  - The only foreign keys are entries/exits → assets (`ON DELETE NO ACTION`). Nothing references order rows.
  - No triggers, rules, dependent views, or row-level security on inventory tables.
- Original records matched **7/7**:
  - entry ids 17–20 and exit ids 10–12
  - UUID fingerprint `575cee25dc0c`
  - `created_at` 2026-11-14 00:27:06 −05:00
  - no other row used that UUID

## 3. Backup (PASS)

- Stored outside Git in a 0700 directory with 0600 files. The backup and its SHA-256 (`8a8ec9f6…4bf7`) contain:
  - the full original rows (ids, foreign keys, quantities, domain fields, timestamps, UUIDs)
  - the canonical asset references
  - a hash snapshot of every unrelated inventory row
- Parsed and checked as restorable: 4 entries and 3 exits, all fields present, timestamps valid.
- A narrowly scoped rollback procedure is stored alongside it. Pre-change copies of the TinyDB file and the repair record (old ids → new ids) are kept with it.
- Nothing from the backup is committed.

## 4. Recurrence prevention (code)

- `app/database.py`: `resolve_database_path()` anchors a relative `SUPPLIER_DB_PATH` to `services/api`, so resolution no longer depends on the working directory.
- `app/inventory_seed.py`:
  - The canonical seed reads its owner **only** from the configured TinyDB file. It refuses stores under temporary directories, and the owner cannot be injected (`seed_inventory(session=None)` takes no user).
  - `apply_seed_catalog()` applies any catalog idempotently inside the caller's transaction.
  - `seed_inventory(session=...)` lets an operator run the canonical seed inside a controlled transaction.
- `tests/test_inventory_postgres.py::test_postgres_seed_exact_counts_net_stock_and_idempotency`:
  - Now seeds a uniquely prefixed `TST-<hex>-` catalog owned by the ephemeral test user, with the explicit seed allowlist checks kept.
  - Asserts that the canonical seed refuses the temporary store.
  - Asserts that canonical rows are byte-identical before and after the test and never owned by the test user.
  - Removes all test-owned rows.
- New offline regression tests (`tests/test_inventory_seed_safety.py`):
  - a temporary TinyDB user cannot own the canonical seed
  - the owner is not injectable by patching
  - an active persistent user is required
  - the isolated catalog is idempotent and correctly attributed
  - relative-path resolution is cwd-independent
- `tests/test_inventory.py` offline seed test now simulates the configured persistent store instead of injecting a users table.

## 5. Persistent identity (PASS)

- Created through the normal `POST /users` flow on the running API, started from the repository root to exercise the cwd fix.
  - 201 Created; `POST /auth/login` returned 200 with a JWT; `GET /auth/me` returned 200.
- The configured TinyDB (`services/api/data/suppliers.json`, Git-ignored) holds 1 user, active, with a stable UUID (fingerprint `bd5d47378e92`). The existing `suppliers` table is unchanged.
- After restarting the API from `services/api`, login and `/auth/me` still returned 200, and the user UUID was unchanged.
- No new authentication implementation was added. Credentials are kept only in the permission-restricted backup directory.

## 6. Controlled reconstruction (7/7 replaced)

The repair ran as a single PostgreSQL transaction:

1. Rechecked the target.
2. Locked the 7 rows with `SELECT … FOR UPDATE` and compared every field to the backup.
3. Ran `DELETE … WHERE id = ANY(:ids) AND user_uuid = :old`, which removed exactly 4 + 3 rows.
4. Ran `seed_inventory(session=…)`, which recreated `{assets: 0, entries: 4, exits: 3}`.
5. Checked all invariants, then committed.

No TRUNCATE, DROP, or CASCADE was used, and no asset rows were touched. New ids: entries 75–78, exits 40–42.

A first attempt failed on a script bind-parameter error after the delete step. The transaction rolled back, and a read-only check confirmed the original seven rows, fingerprint and timestamp were intact before the successful retry.

## 7. Final seed state (all PASS, separate session after commit)

| Assertion | Result |
|---|---|
| Six canonical Assets present | PASS |
| Four canonical AssetEntries | PASS |
| Three canonical AssetExits | PASS |
| No duplicate canonical seeds | PASS |
| NXV-IT-001 current_stock = 12 (also via `GET /inventory/products`) | PASS |
| NXV-PER-001 current_stock = 17 (also via `GET /inventory/products`) | PASS |
| All 7 orders reference the persistent active TinyDB user | PASS |
| Backup available, checksum valid | PASS |
| Unrelated records unchanged (15 assets, 7 entries, 6 exits; hashes identical) | PASS |
| Seed rerun idempotent (`{0,0,0}`, totals 15/11/9 unchanged) | PASS |

Other canonical stock: NXV-IT-002=8; NXV-PER-002, NXV-OFF-001, NXV-TRN-001 = 0.

## 8. Automated tests

`cd services/api && .venv/bin/pytest -v -rs`: **60 collected, 55 passed, 0 failed, 5 skipped.**

The 5 skips are all live PostgreSQL tests: constraints, API persistence, TinyDB login→JWT→UUID, two-session concurrency, and seed. They skipped because `INVENTORY_POSTGRES_TESTS` is not `1` in `.env`. **Skips are not counted as PASS.**

The last recorded live run (`8e2ae01`, 5/5 PASS) predates this change. The rewritten seed test and the other live tests still need a rerun after this change.

Offline coverage in this run: SQLModel models, Pydantic validation, all six inventory endpoints, insufficient stock returns 400, no write after a rejected exit, seed idempotency and attribution, and cwd-independent identity storage.

## 9. Official acceptance matrix

29/29 PASS. T17 changes from BLOCKED to **PASS**: the canonical seed (6/4/3, net stock correct, idempotent) is now attributed to a persistent, active TinyDB identity created through the application's own registration flow. All other rows are as recorded in `INVENTORY-ORM-01-CHECKLIST.md`.

## Remaining action (owner)

1. In the ignored `services/api/.env`, set:
   - `INVENTORY_POSTGRES_TESTS=1`
   - `INVENTORY_TEST_ENV=development`
   - `INVENTORY_TEST_ALLOWED_DATABASE_HOST` / `_USER` / `_NAME` for the isolated development project
2. Run `cd services/api && .venv/bin/pytest -v -rs`. The expected result is 60 passed and 0 skipped.

No credentials, full UUIDs, e-mail addresses, hashes of secrets, or connection strings are recorded here.
