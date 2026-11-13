# Dependency report — Centralized Incident Manager

## Baseline and decision
This milestone branch is based on `origin/main` at `047da24` at implementation start. The baseline is a static company site; backend ORM/database, supplier app, authentication, and previous incident analyzer are not present. Repository discovery identified relevant open work (incident analyzer PR #3, supplier directory #4, auth API #5); none is required to build or run this milestone.

| Required component | Main baseline | Original source inspected | Delivery decision |
|---|---|---|---|
| Authentication | Missing | Pending auth/API PR #5 | Not required by the official endpoint checklist; no existing access middleware was available to retain. |
| ORM/database | Missing | Supplier PR #4 used as reference only | Implemented locally with SQLAlchemy and isolated schema; no PR dependency. |
| CSV analyzer and dataset | Missing | Incident analyzer PR #3 and company briefing | Transformed seed and shared privacy-safe validator implemented locally; sample is included with source attribution. |
| Supplier directory | Missing | Pending supplier PR #4 | Not required; omitted. |
| Frontend architecture | Public static site only | `origin/main` | Backoffice landing page and UI implemented locally. |

Required previous PR merges: **0**. No pending branch is a build or runtime dependency.

| Component needed | Main baseline | Source inspected | Delivery decision |
|---|---|---|---|
| Historical analyzer CSV | Missing | Open incident analyzer PR #3; company briefing attached to that work | Included a sanitized, reproducible 100-row fixture at `data/raw/incidents-nexova.csv`. Company/agent/description values are synthetic and all email values use `.invalid`; the four official invalid-rule cases and valid aggregate counts are preserved. Authorization to commit the original customer PII is not established, so original values are not retained. |
| Historical CSV validation | Missing | Analyzer source code/briefing in PR #3 | Reimplemented minimal shared privacy-safe validator in `packages/shared/nexova_shared/csv_validation.py`. |
| API/ORM/database | Missing | Supplier PR #4 used as architectural reference only | Implemented independent FastAPI, SQLAlchemy, and SQLite/PostgreSQL support locally. |
| Backoffice navigation | Missing | Main only has public website | Added lightweight backoffice shell and incident manager entry point locally. |
| Auth and supplier directory | Not required by this milestone | Open PRs #4/#5 | Not copied; no dependency. |

No previous feature branch is merged or checked out as a dependency. There are zero unmerged-PR dependencies. The CSV and transformation provenance is preserved in `SOURCE_ANALYZER_BRIEFING.md` and `SOURCE_ANALYZER_SPEC.md`; implementation is designed to run from main without pending PRs. Essential persistence, API, shared validation, seed, backoffice navigation, and incident UI components are implemented locally; no code from the pending auth or supplier branches is needed.

## Acceptance verification (2026-11-13)
A fresh clone of `feature/centralized-incident-manager` at `2dd889d3112fc5a6a08024247cf6ca1e3cd071fb` installed from repository manifests, migrated an isolated SQLite DB, seeded the synthetic fixture twice (96 inserted on run one; 0 inserted on run two), and passed backend/shared (6 tests) and frontend test suites. A live browser session connected from UI origin `127.0.0.1:8767` to API origin `127.0.0.1:8765` via the configured CORS allowlist. No other feature branch or pending PR was involved.

Authentication is absent and intentionally not represented as implemented. The API is only suitable for local/assignment development without added deployment access controls. Original customer CSV data was not present in the clone; verifying original-source transformations remains an explicit privacy/availability limitation.

## Dataset privacy and compatibility
The original fixture contains customer-identifying data and its commit authorization could not be independently established. The committed replacement is a synthetic fixture with reserved `.invalid` emails and synthetic company, agent, and description fields; it retains the 100-row count, four rule-specific invalid records, and exact valid status/category aggregates from the briefing. Seed and validator never print or persist emails. This avoids exposing the customer PII while making clean-checkout tests deterministic.

The UI operates against the incident API only. SQLite is the development default; the explicit SQLite migration is `infra/migrations/0001_create_incidents.sql`; startup SQLAlchemy schema creation is idempotent. PostgreSQL is selectable by `DATABASE_URL` (the SQL migration is SQLite-specific). No unrelated auth or supplier behavior has been imported.
