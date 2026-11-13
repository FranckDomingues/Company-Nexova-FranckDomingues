# INVENTORY-ORM-01 — Test report

## Execution status

The official Nexova inventory briefing, official 29-task text, and Supabase credentials were unavailable. No domain endpoint, ORM entity, seed record, or real PostgreSQL integration test has been fabricated. Existing TinyDB authentication implementation was retained. Test totals below distinguish execution status from anticipated evidence.

## Executed local checks

| Suite/check | Result |
|---|---|
| Existing API full regression suite + added utility tests | **34 passed, 0 failed** (`uv run pytest -q`); one upstream Starlette/httpx deprecation warning |
| Inventory arithmetic/unit tests | **4 passed** (included in total) |
| PostgreSQL URL configuration tests | **4 passed** (included in total); no network connection performed |
| `git diff --check` | **PASS** |
| `.env` ignore check | **PASS** (`services/api/.gitignore` ignores `.env*`, except `.env.example`) |
| Real Supabase connection / PostgreSQL integration | **BLOCKED** — DATABASE_URL/approved credentials absent |
| Inventory API/auth/stock/locking/seed tests | **BLOCKED** — domain source unavailable |

## Test commands

```sh
cd services/api
uv sync --extra dev
uv run pytest -q
```

Tests use pure deterministic arithmetic and configuration checks only. They do not claim PostgreSQL reachability, table creation, request/transaction behavior, concurrency guarantees, or domain-specific compliance.
