# INVENTORY-ORM-01 — Final test report

## Final execution

Date: 2026-11-18. Command, run from `services/api`:

```text
uv run --extra dev pytest -q -rs
```

Result: **60 passed, 0 failed, 0 skipped** (60 collected). One existing Starlette/httpx deprecation warning was emitted. The complete run included **all five real PostgreSQL integration tests**; none were skipped or simulated with SQLite.

- Non-PostgreSQL regression and isolated tests: 55 passed.
- Real PostgreSQL tests: 5 passed.
- Final test functions: `test_postgres_tables_foreign_keys_checks_and_unique_sku`, `test_postgres_api_stock_calculation_and_order_persistence`, `test_real_tinydb_login_uuid_is_persisted_on_postgres_order`, `test_postgres_concurrent_exits_do_not_oversell`, and `test_postgres_seed_exact_counts_net_stock_and_idempotency`.

## Live PostgreSQL evidence

The five real integration tests verify PostgreSQL table/constraint behavior, API operations and derived stock, TinyDB registration/login/JWT order attribution, rejected insufficient-stock requests without writes, two-independent-session outbound concurrency, and guarded seed counts, idempotency and net stock. The canonical seed has six assets, four entries and three exits. Verified stocks include `NXV-IT-001=12` and `NXV-PER-001=17`.

T17's authorized identity repair is documented in `INVENTORY-ORM-07-FINAL-ACCEPTANCE.md`: only the seven canonical order rows were backed up and replaced under authorization; unrelated inventory records were checked unchanged. Canonical orders now reference a persistent active TinyDB user. The seed implementation and live seed test prevent an ephemeral test identity from becoming owner of canonical seed rows.

## Official acceptance

The 29 official checkboxes are mapped one-to-one in `INVENTORY-ORM-01-CHECKLIST.md`. Final status: **29/29 PASS**. The six route checks remain subchecks of the single official router item, not additional milestone tasks.

## Safety and repository contents

The final run used the configured ignored development `.env`; credentials are not reproduced here. `.env` remains ignored/untracked. No TinyDB data file, backup, or credential material is included in the staged evidence changes. The repair backup remains outside the repository under the restricted location described in the authorized repair report; it is not part of this commit.
