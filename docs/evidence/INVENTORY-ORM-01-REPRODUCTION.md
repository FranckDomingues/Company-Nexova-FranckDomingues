# Professor reproduction guide — final evidence

## Complete suite

From the repository root:

```sh
cd services/api
uv sync --extra dev
uv run --extra dev pytest -q -rs
```

Final observed result on 2026-11-18: **60 passed, 0 failed, 0 skipped**, including five real PostgreSQL integration tests. One Starlette/httpx deprecation warning is present. Do not describe a run with skipped live tests as live PostgreSQL verification.

## Secure PostgreSQL configuration

1. Use only the authorized, isolated Nexova development Supabase project and its transaction-pooler URI. Configure it only in ignored `services/api/.env` as `DATABASE_URL`; TLS is required (`sslmode=require`). Never paste or print the URI, password, token, or full user identity.
2. For real PostgreSQL integration tests, explicitly configure `INVENTORY_POSTGRES_TESTS=1`, `INVENTORY_TEST_ENV=development`, and the exact matching `INVENTORY_TEST_ALLOWED_DATABASE_HOST`, `_USER`, and `_NAME`. The test fixture fails closed when these do not match the URL or the `.env` is not ignored.
3. For the guarded development seed, configure `INVENTORY_SEED_ENV=development` and matching `INVENTORY_SEED_ALLOWED_DATABASE_HOST`, `_USER`, and `_NAME`. The canonical seed reads its owner only from the persistent TinyDB configured for the application and refuses temporary stores.
4. Run the complete suite as shown above. The final verified run had all five PostgreSQL tests passing. They cover schema/constraints, endpoints and persistence, real TinyDB authentication and UUID attribution, independent-connection concurrency, and seed correctness/idempotency.

## Seed identity and T17

T17 is PASS following the authorized repair documented in `INVENTORY-ORM-07-FINAL-ACCEPTANCE.md`. The seven canonical order rows were backed up and replaced with orders attributed to a persistent active TinyDB user; unrelated inventory data was verified unchanged. The seed is idempotent and refuses temporary identity stores. Canonical derived stock is `NXV-IT-001=12` and `NXV-PER-001=17`. Do not manually rewrite `user_uuid` or run the seed against any database other than the approved isolated development target.

## Evidence files

- `INVENTORY-ORM-01-CHECKLIST.md`: exact one-to-one official 29-task matrix and six endpoint subchecks.
- `INVENTORY-ORM-01-TEST-REPORT.md`: final test totals and integration evidence.
- `INVENTORY-ORM-01-ARCHITECTURE.md`: persistence, models, auth, stock and concurrency.
- `INVENTORY-ORM-07-FINAL-ACCEPTANCE.md`: authorized T17 repair record and verification details.
