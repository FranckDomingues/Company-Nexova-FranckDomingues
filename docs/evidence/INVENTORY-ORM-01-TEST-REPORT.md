# INVENTORY-ORM-01 — Test report (live PostgreSQL validation)

## Final execution

Command: `cd services/api && uv run --extra dev pytest -q -rs`
Result: **55 passed, 0 skipped, 0 failed** (55 collected; one Starlette/httpx deprecation warning).

- Existing regression and isolated tests: 50 passed.
- Live PostgreSQL integration tests: 5 passed against the allowlisted Supabase development transaction pooler.
- PostgreSQL tests were not simulated with SQLite.
- `.env` is ignored by Git; values and connection identity are intentionally not reproduced here.

## Live PostgreSQL evidence

1. Connection and schema: live DB connection succeeded; SQLModel `create_all` ran additively; all three inventory tables were inspected. Both order tables' asset foreign keys exist, invalid FK values were rejected, quantity/category/office constraints and unique SKU were exercised, and no application-owned PostgreSQL `users` table exists.
2. Endpoints: product create/list/detail, inbound, outbound and order list were exercised against PostgreSQL. Product creation started at zero stock; inbound/outbound persisted; `GET` calculated stock from order rows; order-list joins returned asset information.
3. Authentication: test registered a temporary identity in TinyDB, logged in through the existing `/auth/login`, used the JWT for inventory writes, and verified persisted `user_uuid` equality in PostgreSQL.
4. Insufficient stock: live outbound returned HTTP 400 with the required descriptive message. Before/after PostgreSQL exit-row counts were equal.
5. Concurrency: two simultaneous outbound API operations used two distinct PostgreSQL backend PIDs/sessions against five units; one 4-unit exit committed, one was rejected, one row persisted, and remaining stock was one (never negative).
6. Seed: six official SKUs, four inbound rows, three outbound rows, exact names/categories/offices, calculated stock, `GET /inventory/products`, and repeat-run idempotency were verified. `NXV-IT-001` net stock is 12 and `NXV-PER-001` is 17. Existing canonical seed rows were already present; rerunning returned zero inserts. Existing row UUIDs are nonempty but do not match an active identity in the configured local TinyDB. No existing attribution was rewritten; therefore requirement T17's authorized-user attribution remains BLOCKED even though counts/arithmetic/idempotency pass.

## Official checklist

The 29 source checkboxes are mapped one-to-one in `INVENTORY-ORM-01-CHECKLIST.md`; endpoint subchecks do not inflate the count. Evidence-based status: **28 PASS / 1 BLOCKED**. T17 is BLOCKED solely on the pre-existing seed attribution mismatch described above. Do not claim full acceptance.

## Caveats

The Supabase pooler connection's server-reported role may be a proxy role rather than the username embedded in the URL; the test fixture uses exact local allowlists and database/schema evidence. No credentials or personal UUIDs are included in this report. Resolve the pre-existing demo seed attribution through the authorized Nexova development operator before claiming the seed-user identity condition complete.
