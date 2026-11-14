# INVENTORY-ORM-01 — Official milestone traceability

Authority: 4Geeks Academy backend milestone, syllabus revision `fd2da034894ba93ba738559280ccde074ab1d953`; source snapshots and URLs: `docs/evidence/sources/`. The 29 rows below are the exact checkbox requirements (the router endpoint-table item is decomposed into its six required routes). Status is deliberately conservative: local SQLite tests establish application behavior, not live Supabase connectivity.

| ID | Exact requirement (translated faithfully) | Implementation | Evidence | Status |
|---|---|---|---|---|
| M01 | Add Supabase PostgreSQL connection string to `.env`; no hard-coded credentials. | `services/api/app/sql_database.py`, `services/api/.env.example`, `.gitignore` | `test_sql_database.py`; `.env` absent locally | BLOCKED (live config) |
| M02 | Initialize both TinyDB and SQLModel/Supabase connections. | `app/database.py`, `app/sql_database.py`, `app/auth.py` | `test_auth.py`, `test_sql_database.py` | PASS (code); live DB BLOCKED |
| M03 | Per-request `get_db` SQLModel session through `Depends`, no global session. | `app/sql_database.py`, `app/routes/inventory.py` | `test_inventory.py` dependency override | PASS (local) |
| M04 | Company product-equivalent SQLModel (`table=True`) with required domain fields. | `app/inventory_models.py:Asset` | metadata checks; endpoint tests | PASS (local) |
| M05 | Entry-equivalent model with FK, quantity, timestamp, TinyDB UUID, domain fields. | `app/inventory_models.py:AssetEntry` | FK metadata, endpoint attribution tests | PASS (local) |
| M06 | Exit-equivalent model with FK, quantity, timestamp, TinyDB UUID, domain fields. | `app/inventory_models.py:AssetExit` | FK metadata, endpoint tests | PASS (local) |
| M07 | Call `SQLModel.metadata.create_all(engine)` at startup. | `app/main.py:lifespan` | code inspection; requires `DATABASE_URL` | BLOCKED (startup against Supabase) |
| M08 | Independent request and response Pydantic schemas for domain models. | `app/inventory_schemas.py` | validation and API response tests | PASS |
| M09 | Product response includes calculated, nonpersistent `current_stock`. | `AssetResponse`, inventory route | initial stock/list tests | PASS |
| M10 | ORM and Pydantic schemas in separate files/classes. | `inventory_models.py`, `inventory_schemas.py` | `test_inventory.py` and inspection | PASS |
| M11 | Dedicated `/inventory` APIRouter registered in app. | `app/routes/inventory.py`, `app/main.py` | endpoint tests | PASS |
| M12 | `GET /inventory/products` lists products with current stock. | `routes/inventory.py:list_assets` | product list test | PASS (local) |
| M13 | `POST /inventory/products` creates authenticated product. | `routes/inventory.py:create_asset` | create/auth/duplicate tests | PASS (local) |
| M14 | `GET /inventory/products/{id}` retrieves product/current stock. | `routes/inventory.py:get_asset` | detail/missing tests | PASS (local) |
| M15 | `POST /inventory/orders/inbound` records authenticated entry. | `routes/inventory.py:create_entry` | inbound/office/auth tests | PASS (local) |
| M16 | `POST /inventory/orders/outbound` records authenticated exit. | `routes/inventory.py:create_exit` | outbound/stock/auth tests | PASS (local) |
| M17 | `GET /inventory/orders` lists orders with asset data and `user_uuid`. | `routes/inventory.py:list_orders` | combined listing + query-count test | PASS (local) |
| M18 | Calculate stock as entries minus exits, scoped per briefing partition; never editable. | `routes/inventory.py`, `inventory_models.py` | stock and forbidden-field tests | PASS (local) |
| M19 | New product has zero stock; stock added only through entries. | create/list routes | product initial stock test | PASS (local) |
| M20 | Every order creation requires auth and stores authenticated TinyDB UUID. | `routes/inventory.py`, `auth.py`, `routes/users.py` | attribution/auth tests | PASS (local) |
| M21 | Reject negative-result exit before write with HTTP 400 descriptive message. | `routes/inventory.py:create_exit` | exact detail and zero rows test | PASS (local); PostgreSQL locking BLOCKED |
| M22 | Seed minimum briefing records and verify net stock. | `app/inventory_seed.py` | seed test pending live PostgreSQL | BLOCKED |
| M23 | TinyDB and Supabase used for the proper data domains. | database/auth and SQLModel code | offline behavior tests; no Supabase URI | BLOCKED (live verification) |
| M24 | All inventory endpoints grouped under dedicated router. | `app/routes/inventory.py` | route tests/OpenAPI | PASS |
| M25 | ORM entry/exit FK relationships to briefing-named Asset. | `app/inventory_models.py` | metadata FK assertions | PASS (local) |
| M26 | Stock is order-derived; no direct mutation endpoint/column. | models, schemas, router | product rejects `current_stock` request test | PASS |
| M27 | Stock scope follows briefing (Asset and office; office must match asset). | `routes/inventory.py`, schemas | office consistency test | PASS (local) |
| M28 | Oversized exit returns 400 before any write. | `routes/inventory.py:create_exit` | database count remains zero | PASS (SQLite simulation; PostgreSQL behavior BLOCKED) |
| M29 | Each order stores authenticated TinyDB creator UUID. | `auth.py`, order route | order attribution assertions | PASS (local) |

## Summary
Implementation behavior currently verified locally: 26/29. Requirements M01, M07, M23 require authorized isolated development Supabase connectivity and remain BLOCKED. M22's idempotent seed algorithm and exact row minima are covered by an isolated test, but actual seeding/`GET` verification on the required isolated Supabase development database remains BLOCKED. The milestone's six functional routes are implemented, but full official acceptance is not claimed.
