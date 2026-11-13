# INVENTORY-ORM-01 — Traceability checklist (BLOCKED)

**Verdict: BLOCKED for domain implementation.** The requested company-specific inventory briefing and the official 29-task source were not present in this repository or available branches. `CONTEXT.md` is only a pointer to company briefing files and lists Nexova as an HR consultancy; it contains no inventory domain model. The exact schema, partitioning, GET policy, seed records, and milestone task text cannot be safely inferred. As requested, no inventory ORM entities, endpoints, seed records, or domain compliance claims are fabricated.

The following rows enumerate the requested scope from the task prompt as requirement IDs; they are not represented as a recovered verbatim copy of the absent 4Geeks portal rubric. Each unknown condition is blocked pending the actual company briefing and 29-task source.

| Requirement ID | Exact requirement (as supplied in task) | Implementation file | Test evidence | Status |
|---|---|---|---|---|
| INV-01 | Inspect Git status, branches, and repository structure | N/A | Recorded in execution transcript; clean initial status | PASS |
| INV-02 | Locate existing FastAPI service | `services/api/app/main.py` | Existing app inspected | PASS |
| INV-03 | Locate functional TinyDB `User` and `get_current_user` | `services/api/app/auth.py`, `database.py` | Existing AUTH-01 suite covers auth | PASS |
| INV-04 | Inspect auth branches and PR dependencies | N/A | PR #4/#5 inspected; target bases verified | PASS |
| INV-05 | Locate company briefing and course context | `CONTEXT.md` | Confirmed inventory briefing unavailable | BLOCKED |
| INV-06 | Extract exact entities, fields, validation, partitions, auth, seed | N/A | No source available; do not invent | BLOCKED |
| INV-07 | Extend existing FastAPI app; separate TinyDB auth and PostgreSQL inventory | `services/api/app/sql_database.py` | URL config unit tests only; no inventory app integration | BLOCKED |
| INV-08 | Use SQLModel for inventory ORM | `services/api/app/inventory_models.py` | No entities pending source | BLOCKED |
| INV-09 | Keep business logic independent of HTTP and persistence | `services/api/app/inventory_service.py` | `test_inventory_service.py` | PARTIAL |
| INV-10 | Add sqlmodel and psycopg2-binary with existing manager | `services/api/pyproject.toml`, `uv.lock` | `uv sync`/tests pending below | PASS |
| INV-11 | Configure Supabase PostgreSQL engine; preserve TinyDB | `services/api/app/sql_database.py` | Config tests do not prove external connectivity | PARTIAL |
| INV-12 | Read DATABASE_URL and use session-per-request `get_db` | `services/api/app/sql_database.py` | URL and missing-config unit tests | PARTIAL |
| INV-13 | Inject sessions with FastAPI Depends; no global sessions | `services/api/app/sql_database.py` | No routes implemented | BLOCKED |
| INV-14 | Startup metadata.create_all after importing registered models | `services/api/app/main.py` | Not implemented without exact model definitions | BLOCKED |
| INV-15 | Require Supabase transaction pooler URI and TLS | `services/api/app/sql_database.py`, `.env.example` | TLS config unit tests; no real Supabase credential/connection | PARTIAL |
| INV-16 | Model product-equivalent, inbound order, outbound order from briefing | `services/api/app/inventory_models.py` | No entities pending source | BLOCKED |
| INV-17 | Primary keys, database foreign keys, positive quantities, constraints, timestamps | N/A | Exact fields/constraints unavailable | BLOCKED |
| INV-18 | Store TinyDB user_uuid without cross-database FK; never replicate users | N/A | No order models/routes | BLOCKED |
| INV-19 | Never directly editable stock | N/A | No product API/model | BLOCKED |
| INV-20 | Independent Pydantic request and response schemas; calculated current_stock; reject stock mutation | N/A | No schemas/routes | BLOCKED |
| INV-21 | Register dedicated router at `/inventory` and implement six required endpoints | `services/api/app/main.py` | Endpoints not implemented | BLOCKED |
| INV-22 | Require auth for writes and apply briefing-specific GET policy | `services/api/app/auth.py` | Existing auth preserved; inventory policy unavailable | BLOCKED |
| INV-23 | Attribute orders to authenticated TinyDB user's UUID | N/A | User's current identity is numeric TinyDB ID; briefing UUID mapping unavailable | BLOCKED |
| INV-24 | Include required product information in orders and avoid N+1 | N/A | No list query / response contract available | BLOCKED |
| INV-25 | Calculate stock as inbound sum minus outbound sum, with exact briefing partitioning | `services/api/app/inventory_service.py` | Pure arithmetic tests; partition scope unknown | PARTIAL |
| INV-26 | New product zero stock; inbound adds; outbound subtracts | `services/api/app/inventory_service.py` | Arithmetic tests only; no persisted flow | PARTIAL |
| INV-27 | Reject overselling with HTTP 400, descriptive response, no write, unchanged stock | N/A | Pure guard only; HTTP/database behavior untested | BLOCKED |
| INV-28 | Protect concurrent outbound requests against overselling with PostgreSQL locking/transactions and rollback | N/A | No PostgreSQL transaction implementation | BLOCKED |
| INV-29 | Idempotent seed with exact minimum records, verify net stock | N/A | Required records unavailable; no seed command | BLOCKED |

## Notes
- The exact 29 official checklist items have **not** been obtained. The 29 lines above are an honest traceability inventory of supplied task clauses, not claims about the official portal text.
- Existing TinyDB authentication was preserved unchanged from verified `feature/auth-api`.
- The PostgreSQL infrastructure test suite is not a real Supabase integration test. No credentials were available; no SQLite substitution was made.
- Resume implementation only after supplying the official company briefing and milestone rubric. Then replace this blocked checklist with verbatim requirement texts and add evidence per item.
