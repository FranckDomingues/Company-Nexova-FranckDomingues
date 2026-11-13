# INVENTORY-ORM-01 — Architecture and current scope

## Existing application

The FastAPI application remains `services/api/app/main.py`. Authentication and users continue to use TinyDB via `app.database`; existing JWT verification remains `app.auth.get_current_user`. No second app or auth system has been created.

## PostgreSQL infrastructure groundwork

`app.sql_database` independently parses `DATABASE_URL`, requires PostgreSQL, and enforces `sslmode=require`. `get_engine()` memoizes the connection pool/engine, not a session. `get_db()` yields and closes a SQLModel `Session` per request and rolls back when its consumer raises. `.env.example` documents a Supabase transaction-pooler URI shape without credentials; `.env` is ignored.

`app.inventory_service` contains pure movement arithmetic (`sum(inbound) - sum(outbound)`) and an availability guard. These are foundational only: partitioning cannot be selected without the briefing.

## Domain model is intentionally absent

No inventory ORM entities, relationships, request/response schemas, API routes, lock strategy, startup `create_all`, or seed data are implemented. These depend on the exact company briefing and may not be inferred from unrelated Nexova supplier records. Consequently, no inventory data or users are written to either DB by this milestone work.

## Expected separation after blocker resolves

- TinyDB: existing auth users and profiles only.
- Supabase PostgreSQL: exact briefing-defined inventory entities and movement orders.
- SQLModel: persistence entities, with database-side foreign keys only among PostgreSQL inventory tables; TinyDB user UUIDs remain scalar attribution values.
- Pydantic: independent external request/response schemas.
- Business service: stock calculations/transaction rules independent from HTTP routing.

This section describes intended boundaries and infrastructure currently present; it is not evidence that the complete inventory system is operational.
