# INVENTORY-ORM-05 — PostgreSQL and TinyDB environment diagnosis

Date: 2026-11-14. This is a read-only environment investigation. No schema initialization, inventory seed, identity creation, or inventory-row mutation was performed.

## Root-cause determination

**Primary cause: incorrect PostgreSQL schema/table-name inspection in the previous follow-up, compounded by different environment-loading paths for the application and the live-test fixture.** The actual SQLModel table names are `inventory_assets`, `inventory_asset_entries`, and `inventory_asset_exits`, all in `public`. Earlier follow-up inspection queried `asset`/`assetentry`/`assetexit` and therefore reported an undefined table; an earlier schema check was restricted to its default schema. The current read-only catalog scan across non-system schemas finds all three canonical tables, six official assets, four inbound orders, and three outbound orders. The previously observed absence was not evidence that the database lacked these tables.

The live-test fixture does **not** obtain `DATABASE_URL` from the process environment or `load_dotenv()`: it reads `services/api/.env` directly via `dotenv_values`, validates explicit test allowlists, sets `DATABASE_URL` for the fixture, and clears the cached engine before connecting. The application uses `python-dotenv` `load_dotenv()` with its default `override=False`; an already-exported shell `DATABASE_URL` therefore takes precedence over the `.env` value. In this investigation, no shell `DATABASE_URL` was exported, so the direct `.env` URL and Python process target were consistent. The test-specific allowlists/opt-ins are currently absent/mismatched, so live tests should fail closed/skip rather than be rerun against an unapproved target.

The pooler URL's database name agrees with `current_database()`, but `current_user`/`session_user` differs from the username embedded in the pooler URL. This is consistent with a pooler/proxy role mapping but does not alone prove the account/project owner. The configured explicit seed host/user/database allowlist matches the URL. Do not alter the URL or infer ownership from the role discrepancy.

## Required status checks

- **PostgreSQL target consistency: PASS (internal consistency only).** The current `.env` URL connects to PostgreSQL; actual `current_database()` equals the URL database, and the seed's explicit host/user/database allowlist matches. The current integration-test opt-in/allowlist is not configured, so the target is not currently authorized for a new integration test run by that fixture. Project ownership/authorization must still be supplied by the operator.
- **Schema visibility: PASS.** Read-only `pg_catalog` inspection across non-system schemas located all three SQLModel tables in `public`, with names matching `app/inventory_models.py`.
- **TinyDB runtime path consistency: PASS.** Authentication and seed both call `get_users_table()` from `app.database`; default path is anchored to the module path and independent of working directory. In this checkout the resolved path is `services/api/data/suppliers.json`. `SUPPLIER_DB_PATH` is not exported in the process; no alternate configured path is present.
- **Historical data availability: PARTIAL.** Canonical inventory rows are presently accessible in the configured PostgreSQL database. The configured TinyDB file contains zero users, so no active identity is available locally. No TinyDB backup location is configured; this investigation did not search outside the repository or access any unconfigured backup.

## Read-only canonical data findings

Queries used separate entry and exit aggregation by asset to avoid join multiplication. The result is:

- Official assets: 6.
- Canonical entry orders: 4.
- Canonical exit orders: 3.
- Net stock: `NXV-IT-001=12`, `NXV-IT-002=8`, `NXV-OFF-001=0`, `NXV-PER-001=17`, `NXV-PER-002=0`, `NXV-TRN-001=0`.
- All seven canonical order rows have a nonempty `user_uuid`, in one UUID group. Its value was masked in terminal output and is not recorded here.
- Active TinyDB users with UUIDs at the resolved path: 0; matching active identities: 0.

Thus canonical records are available, but their user attribution cannot currently be tied to a legitimate active TinyDB identity. T17 cannot be resolved by changing database configuration alone unless the authorized operator identifies the correct, legitimate TinyDB identity store.

## TinyDB file status

The resolved file exists and contains a `suppliers` table but no `users` table. It may have been created by prior application/test activity, but the available file contents and metadata do not establish when or why it was created; this report does not assert that it was created unintentionally. No other repository-local TinyDB or backup candidate was found. No backups outside the repository were checked because no explicit authorized backup path was configured.

## T17 resolution options and exact next action

1. **Do not change `DATABASE_URL` or rewrite seed UUIDs.** Current URL, actual database name, seed allowlist, and visible canonical data are internally consistent. The URL username/session-role difference is not sufficient evidence for a correction.
2. Ask the authorized Nexova development database owner to confirm that the connected Supabase project is the intended isolated development target, and to provide the approved development TinyDB path or backup path (without sharing credentials in chat or source).
3. If the original active user can be recovered from that authorized store/backup, point authentication and seeding to that same verified file via `SUPPLIER_DB_PATH`, using an absolute path. Before selecting it, verify the active user through the normal authenticated API flow; do not copy password material or fabricate an identity. Then run a read-only comparison of canonical order UUIDs against active TinyDB UUIDs, reporting only match counts/masked values.
4. If no legitimate user can be recovered, the database owner must explicitly confirm that the identified seven canonical order rows are disposable development fixtures and authorize their narrow replacement. Before any replacement, preserve a database backup and attribution evidence; replace only exact canonical rows through the supported seed operation using a legitimate active TinyDB user. This would be a separate, explicitly authorized write operation and is **not performed here**.
5. Only after either recovery or explicit replacement authorization: confirm both data stores and the integration-test allowlist identify the approved isolated development environment; run the seed idempotency and stock/API/auth checks, then the live PostgreSQL concurrency test and full suite. T17 remains BLOCKED until canonical order UUIDs match a legitimate active TinyDB user and the required seed evidence is rerun successfully.

## Non-destructive verification evidence

- Branch: `feature/inventory-orm-dual-db`; starting HEAD was `10a29274ecdbeb839034b531bc7343f1f80c8ffd`; worktree was clean.
- PostgreSQL actions were read-only connection identity, catalog, count, UUID-grouping, and aggregate queries. No `create_all`, seed, insert, update, delete, truncate, or schema changes were issued.
- TinyDB inspection was read-only JSON parsing and aggregate counting; no users or records were created or edited.
- Targeted isolated tests: `cd services/api && .venv/bin/pytest -q tests/test_inventory_seed_safety.py tests/test_inventory.py` — **16 passed**, one pre-existing Starlette/httpx deprecation warning. These tests do not write to live PostgreSQL.
- Earlier recorded full run remains **55 passed** (50 isolated/regression + 5 PostgreSQL integration); this diagnostic did not rerun live integration tests.
- `.env` is ignored and untracked. No credentials, complete connection strings, full UUIDs, or user records are included in this document.

## Acceptance

Official status remains **28/29 PASS; T17 BLOCKED**. No evidence was promoted and no historical attribution was altered.
