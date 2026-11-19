# INVENTORY-ORM-06 — TinyDB identity recovery and T17 resolution attempt

Date: 2026-11-18. Read-only recovery investigation. No database rows, TinyDB files, identities, `.env` values, or seed data were created, modified, copied, or deleted.

## Verdict

**Case D — no matching TinyDB found. The historical identity is irrecoverable from available evidence, and the evidence indicates it was never a persistent application identity.** T17 remains **BLOCKED**. Official acceptance remains **28/29 PASS**.

## 1. Safety preflight

| Check | Result |
|---|---|
| Repository / branch | `Company-Nexova-FranckDomingues`, `feature/inventory-orm-dual-db`, HEAD `0ac2a47`, clean worktree |
| `.env` ignored | YES (`services/api/.gitignore:10`), untracked |
| Seed host/user/database allowlist vs. `DATABASE_URL` | all three match |
| Live-test host allowlist vs. `DATABASE_URL` | **mismatch**; live integration tests are not currently authorized and were not run |
| Connection | PASS, inside a `SET TRANSACTION READ ONLY` transaction (`transaction_read_only=on`), rolled back |
| `current_database()` vs. URL database | match |
| Inventory tables | `inventory_assets`, `inventory_asset_entries`, `inventory_asset_exits` present |

## 2. TinyDB configuration findings

- `app/database.py`: `DEFAULT_DATABASE_PATH` is module-anchored (`services/api/data/suppliers.json`). `get_database()` uses `SUPPLIER_DB_PATH` if it is set in the process environment.
- `app/sql_database.py` calls `load_dotenv()` (default `override=False`) at import. `services/api/.env` sets `SUPPLIER_DB_PATH` to a **relative** path (`./data/suppliers.json`). Once the app or seed imports `sql_database`, TinyDB therefore resolves against the **process working directory**, not the module.
  - **Correction to INVENTORY-ORM-05:** that report said the resolved path is independent of the working directory. That is true only when `SUPPLIER_DB_PATH` is unset. With the current `.env`, it is cwd-dependent. From the documented cwd (`services/api`) it resolves to the same file.
  - Alternative resolutions were checked: `<repo>/data/suppliers.json` and `services/data/suppliers.json`. Neither exists.
- Auth and seed both use `get_users_table()` → `users` table of that TinyDB file.
- TinyDB data has never been committed. Git history across all local and remote branches and stashes contains no TinyDB data or backup files.

## 3. Search scope and candidates

Searched (project-related only; content-checked JSON for a TinyDB `users` table):

1. This repository, including Git history for all refs and stashes.
2. Linked Git worktrees `Company-Nexova-EH-01` and `Company-Nexova-centralized-incident-manager`.
3. Working-directory variants of the relative `SUPPLIER_DB_PATH`.
4. This project's pytest temporary base directory (the only place test-created TinyDB identities are written).

Not searched: the whole home directory, system dirs, cloud drives, browser or password stores, and non-Nexova projects. No `sudo` was used.

| Candidate | TinyDB format | Users | Active | UUID match | Provenance |
|---|---|---|---|---|---|
| `services/api/data/suppliers.json` | valid (only a `suppliers` table; **no `users` key ever created**) | 0 | 0 | NO | n/a |
| Retained pytest runs (3 dirs, 0 files) | none present | — | — | NO | n/a |

Candidate databases inspected: **1** (plus 3 empty pytest run directories).

## 4. Historical provenance of the canonical UUID

PostgreSQL (read-only):

- 6 canonical assets, 4 entries, 3 exits. Stock: IT-001=12, IT-002=8, PER-001=17, PER-002=0, OFF-001=0, TRN-001=0. Unchanged from ORM-05.
- All 7 canonical orders share **one** `user_uuid` (SHA-256 fingerprint prefix `575cee25dc0c`) and the **same `created_at` second**: 2026-11-14 00:27:06 −05:00. That means a single seed invocation.
- No other inventory row uses that UUID.

Timeline:

| Time (−05:00) | Event |
|---|---|
| 2026-11-12 19:19 | `services/api/data/suppliers.json` last modified; it has never contained a `users` table |
| 2026-11-13 23:00 | `seed_inventory()` introduced (`577f691`) |
| 2026-11-14 00:09 | Live test `test_postgres_seed_exact_counts_net_stock_and_idempotency` added (`5707af0`) |
| **2026-11-14 00:27:06** | **All 7 canonical orders inserted in one seed run** |
| 2026-11-14 00:40 | Earliest still-retained pytest run; `8e2ae01` records live PostgreSQL 5/5 PASS |

Analysis:

- `seed_inventory()` refuses to run without an active TinyDB user and never creates one. The configured TinyDB has never held a user, so a CLI seed against it could not have produced these rows.
- The only repository code path that seeds live PostgreSQL with a user is that live test. It registers a throwaway user (`seed-<random hex>@example.com`) through `POST /users` into a pytest `tmp_path` TinyDB, monkeypatches the seed to use it, and calls `seed_inventory()` against the shared development database. On an empty database, that first call inserts the canonical rows attributed to the throwaway user.
- Pytest keeps only the last 3 base temp directories. The run at ~00:27 has been rotated out, and no TinyDB file survives.

**Conclusion (inferred, strongly supported; not directly provable):** the canonical UUID belongs to an ephemeral test identity created by the live seed test. That identity was never a persistent Nexova application user, so there is no "original legitimate identity" to restore. Case A/B/C do not apply. A configuration-only correction (`SUPPLIER_DB_PATH`) cannot resolve T17.

## 5. Configuration consistency

No change was made. Recommended later, as a separately authorized change: make `SUPPLIER_DB_PATH` absolute, or unset it so the module-anchored default applies. This removes the cwd dependency.

## 6. Verification

- PostgreSQL rows preserved: YES (read-only transaction; counts and stock identical to ORM-05).
- TinyDB authentication against a recovered identity: BLOCKED (none recovered).
- Offline regression: `.venv/bin/pytest -q -m "not postgres_integration"` gives **50 passed, 5 deselected**, 1 pre-existing Starlette deprecation warning.
- Live PostgreSQL integration (5 tests): **not rerun**, because the test host allowlist does not match `DATABASE_URL`. Last recorded result is 5/5 PASS (`8e2ae01`).
- Phase 6 (login/JWT/UUID match, endpoint, idempotency and concurrency re-verification) was not executed, because no identity was recovered.

## 7. Remaining blockers and required decision

T17 requires canonical seed orders attributed to an authorized active TinyDB user. That cannot be satisfied by recovery. The database owner must choose one of:

1. **Authorize a narrowly scoped re-attribution or replacement** of exactly the 7 canonical order rows (fingerprint `575cee25dc0c`, created 2026-11-14 00:27:06 −05:00), after taking a backup. They would be re-seeded with a real active user registered through the normal `POST /users` flow in the configured TinyDB.
2. **Accept the test-created attribution** as fulfilling T17 for a development seed. This is a grading/policy decision, not something this investigation can assert.

Separately recommended: change the live seed test so it never becomes the first writer of canonical rows (for example, skip or fail when the canonical rows are absent and an authorized user is not configured). Otherwise the problem recurs on any fresh database.

No passwords, hashes, tokens, full UUIDs, e-mail addresses, or connection strings are recorded here.

## Outcome (INVENTORY-ORM-07)

The owner chose option 1 (authorized replacement). The seven orders were backed up and replaced 7/7, and are now attributed to a persistent active TinyDB user. The recommended cwd fix and the live seed-test fix are implemented. T17: PASS. See `INVENTORY-ORM-07-FINAL-ACCEPTANCE.md`.
