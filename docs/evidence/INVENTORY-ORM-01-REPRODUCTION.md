# INVENTORY-ORM-01 — Reproduction and current blocker

## Current branch state

This checkout contains the API infrastructure groundwork but **not a runnable inventory feature**. The domain task is blocked because the company-specific inventory briefing and the official 29-task milestone rubric were not found. Do not infer schema, stock partition, authorization, or seed values from unrelated supplier data.

## Existing TinyDB regression

```sh
cd services/api
uv sync --extra dev
uv run pytest -q
```

Use a local disposable TinyDB path and a local JWT secret of at least 32 characters when manually running the auth API. The included auth tests use isolated fixtures.

## PostgreSQL setup when the official requirements are supplied

1. Obtain the approved Supabase project and use its **transaction pooler** connection URI (typically port `6543`).
2. Copy `.env.example` to `.env`; set `DATABASE_URL` locally. The application validates PostgreSQL scheme and enforces `sslmode=require`. Never commit `.env` or paste the full connection URI into tickets, logs, screenshots, or reports.
3. Ensure the test user/project is explicitly approved and disposable before running integration tests. Never run destructive fixture cleanup against production data.
4. Implement and review the exact briefing-defined models, migrations/schema creation, routes, and seed records before expecting inventory commands to work.

At present no real Supabase connection has been established and there is no seed command. The sample URI format is a template only, not a credential.

## Verification performed in this checkout

`cd services/api && uv sync --extra dev && uv run pytest -q` completed with **34 passed, 0 failed**. `git diff --check` passed. These results verify the existing TinyDB regression suite plus pure stock/configuration helpers only; they do not mean any inventory endpoint or Supabase connection is available.
