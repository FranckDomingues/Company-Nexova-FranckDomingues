# Nexova API — Centralized Incident Manager

FastAPI + SQLAlchemy API. SQLite is the safe default for local development; PostgreSQL is selected with `DATABASE_URL`. This branch includes its own API implementation and does not require pending PRs.

## Setup (Python 3.11+)

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e packages/shared
pip install -e 'services/api[test]'
```

Run historical seed from repo root: `python scripts/seed_incidents.py`. The seeder creates missing schema idempotently for convenience. For an explicit fresh SQLite schema, create the directory and apply the versioned SQL migration before seeding: Default DB: `services/api/data/incidents.db`; override with `DATABASE_URL=sqlite:////absolute/path/to/incidents.db`. PostgreSQL example: `DATABASE_URL=postgresql+psycopg://...`.

```bash
mkdir -p services/api/data
sqlite3 services/api/data/incidents.db < infra/migrations/0001_create_incidents.sql
python scripts/seed_incidents.py
python scripts/seed_incidents.py  # proves duplicate-safe rerun
```

Run API: `cd services/api && uvicorn app.main:app --reload` (development schema is also created on startup). The SQL file is a SQLite development migration; PostgreSQL deployments use SQLAlchemy's idempotent schema creation until a migration framework is adopted.
Run tests: `cd services/api && pytest -q`.

## Endpoints

- `POST /api/incidents`
- `GET /api/incidents?status=&origin=&branch=&category=`
- `GET /api/incidents/{id}`
- `PATCH /api/incidents/{id}/status`
- `GET /api/incidents/summary`

Validation returns safe field errors with HTTP 400; missing IDs are 404; unexpected errors are sanitized to generic HTTP 500 messages.
