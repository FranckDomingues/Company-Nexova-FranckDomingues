# Official acceptance checklist (47 tasks)

Source: [4Geeks Centralized Incident Manager README.es.md](https://github.com/4GeeksAcademy/ai-engineering-syllabus/blob/main/content/projects/ai-eng-centralized-incident-manager/README.es.md). All 47 source checkboxes are mapped in original order: implementation requirements (27: model/seed 6, backend 8, frontend 13) followed by evaluation requirements (20). **PASS is only assigned when direct verification exists.**

| # | Requirement (official task) | Implementation | Verification | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Define Incident fields: generated id, required title/description, category/status/origin/branch, created_at/updated_at | `services/api/app/models.py`, `services/api/app/orm.py` | `pytest -q services/api/tests` | PASS | API tests |
| 2 | Apply required-field and allowed status/origin/category integrity constraints | `services/api/app/orm.py` | `pytest -q services/api/tests::test_database_constraints` | PASS | API tests |
| 3 | Seed script reads historical CSV and sets all imported origin to customer | `scripts/seed_incidents.py` | `python scripts/seed_incidents.py` | PASS | Execution report |
| 4 | Apply briefing CSV transformations for status, category, title, date, branch | `scripts/seed_incidents.py` | `pytest -q services/api/tests::test_seed_summary_totals_and_idempotency` | PASS | Seed aggregate test |
| 5 | Reuse shared validation, skip and report invalid rows | `packages/shared/nexova_shared/csv_validation.py`, `scripts/seed_incidents.py` | `pytest -q packages/shared/tests services/api/tests` | PASS | Seed report; validator tests |
| 6 | Seed idempotently using CSV identifier | `scripts/seed_incidents.py` | `pytest -q services/api/tests::test_seed_summary_totals_and_idempotency` | PASS | Seed twice assertion |
| 7 | POST creates incident and returns descriptive 400 for invalid input | `services/api/app/main.py` | `pytest -q services/api/tests::test_status_lifecycle_and_validation` | PASS | API tests |
| 8 | GET list supports status, origin, branch, category filters | `services/api/app/main.py` | `pytest -q services/api/tests::test_empty_summary_crud_filters` | PASS | API tests |
| 9 | GET detail returns 404 for missing record | `services/api/app/main.py` | `pytest -q services/api/tests::test_empty_summary_crud_filters` | PASS | API tests |
| 10 | PATCH status enforces the stated lifecycle and terminal states | `services/api/app/main.py` | `pytest -q services/api/tests::test_status_lifecycle_and_validation` | PASS | API tests |
| 11 | Summary returns status/category/origin/branch metrics | `services/api/app/main.py` | `pytest -q services/api/tests` | PASS | API tests |
| 12 | Unexpected errors return sanitized 500; no stack traces | `services/api/app/main.py` | `pytest -q services/api/tests::test_database_failures_return_sanitized_500` | PASS | API test |
| 13 | Validation errors return HTTP 400 with field-level JSON | `services/api/app/main.py` | `pytest -q services/api/tests::test_status_lifecycle_and_validation` | PASS | API test |
| 14 | Reads work on empty database | `services/api/app/main.py` | `pytest -q services/api/tests::test_empty_summary_crud_filters` | PASS | API test |
| 15 | Frontend registration page accessible from application navigation | `uis/backoffice/index.html`, `uis/backoffice/incidents/index.html` | Open backoffice and navigate using Incident Manager menu | PARTIAL | Browser capture blocked; see execution report |
| 16 | Form contains all model fields; branch required and all briefing locations labeled | `uis/backoffice/incidents/index.html` | UI DOM test and source option review | PASS | UI test/source |
| 17 | Branch field visually highlighted when origin=branch | `uis/backoffice/incidents/app.js`, `styles.css` | Change origin to branch in UI | PARTIAL | Browser verification pending |
| 18 | Form shows loading indicator and disables submit while pending | `uis/backoffice/incidents/app.js` | Deferred POST interaction test | PARTIAL | Browser/interaction test pending |
| 19 | Form API failures show safe user-facing and field-specific errors | `uis/backoffice/incidents/app.js` | `npm test` | PARTIAL | Generic failure covered; field API response coverage pending |
| 20 | Successful form submit resets and confirms | `uis/backoffice/incidents/app.js` | Successful POST interaction test | PARTIAL | Interaction test pending |
| 21 | Incident list offers status/origin/branch filters | `uis/backoffice/incidents/index.html`, `app.js` | UI source review | PASS | UI source |
| 22 | List displays loading state | `uis/backoffice/incidents/app.js` | Delayed list response interaction test | PARTIAL | Browser/interaction test pending |
| 23 | List failure shows retry action and remains usable | `uis/backoffice/incidents/app.js` | Failed list request and retry | PARTIAL | Browser/interaction test pending |
| 24 | Empty list/filter results show an informative message | `uis/backoffice/incidents/app.js`, `index.html` | Empty response interaction test | PASS | UI source |
| 25 | Incident status update available from list; failed request rolls back and notifies | `uis/backoffice/incidents/app.js` | `npm test` | PASS | UI rollback test |
| 26 | Summary shows metrics by status/category/origin/branch | `uis/backoffice/incidents/app.js`, `index.html` | UI source review | PASS | UI source |
| 27 | Summary loading and failure states do not break other views | `uis/backoffice/incidents/app.js` | Failed summary request and retry | PARTIAL | Browser/interaction test pending |
| 28 | Model includes all required fields and integrity constraints (evaluation) | `services/api/app/models.py`, `orm.py` | `pytest -q services/api/tests` | PASS | API tests |
| 29 | Seed loads historical records with customer origin (evaluation) | `scripts/seed_incidents.py` | Seed test | PASS | Seed integration test |
| 30 | Seed transformation rules match briefing (evaluation) | `scripts/seed_incidents.py` | Seed summary test | PASS | Exact status/category totals |
| 31 | Invalid source rows excluded and reported (evaluation) | `scripts/seed_incidents.py` | Seed summary test | PASS | Exact reason counts |
| 32 | Seed is idempotent (evaluation) | `scripts/seed_incidents.py` | Seed twice test | PASS | Integration test |
| 33 | Seed summary status/category totals match briefing (evaluation) | `scripts/seed_incidents.py` | Seed summary test | PASS | Exact expected totals asserted |
| 34 | API endpoints use correct success/error codes (evaluation) | `services/api/app/main.py` | `pytest -q services/api/tests` | PASS | API suite |
| 35 | API validation identifies problem field (evaluation) | `services/api/app/main.py` | `pytest -q services/api/tests` | PASS | API suite |
| 36 | API never exposes stack trace (evaluation) | `services/api/app/main.py` | `pytest -q services/api/tests::test_database_failures_return_sanitized_500` | PASS | API test |
| 37 | Invalid state changes rejected with 400 (evaluation) | `services/api/app/main.py` | `pytest -q services/api/tests::test_status_lifecycle_and_validation` | PASS | API test |
| 38 | Empty summary metrics correct (evaluation) | `services/api/app/main.py` | `pytest -q services/api/tests::test_empty_summary_crud_filters` | PASS | API test |
| 39 | Client validates required fields before POST (evaluation) | `uis/backoffice/incidents/app.js` | `npm test` | PASS | UI DOM test |
| 40 | Branch field highlight and briefing labels work (evaluation) | `uis/backoffice/incidents/app.js`, `index.html` | Manual browser test | PARTIAL | Browser test pending |
| 41 | Loading states visible and submit disabled (evaluation) | `uis/backoffice/incidents/app.js` | Manual browser test | PARTIAL | Browser test pending |
| 42 | API errors shown in understandable language, never technical text (evaluation) | `uis/backoffice/incidents/app.js` | `npm test` safe network failure | PASS | UI DOM test |
| 43 | List handles loading, empty, and populated states (evaluation) | `uis/backoffice/incidents/app.js` | `npm test` plus manual browser | PARTIAL | Populated/error states not all exercised |
| 44 | Failed status update rolls back visually (evaluation) | `uis/backoffice/incidents/app.js` | `npm test` | PASS | UI rollback test |
| 45 | Summary endpoint returns metrics even with no incidents (evaluation) | `services/api/app/main.py` | `pytest -q services/api/tests::test_empty_summary_crud_filters` | PASS | API test |
| 46 | Shared validation is in packages/shared and reused by script/API (transversal) | `packages/shared/nexova_shared/csv_validation.py`, `scripts/seed_incidents.py` | `pytest -q packages/shared/tests services/api/tests` | PASS | Shared + integration tests |
| 47 | Code organized in monorepo structure (transversal) | `scripts/`, `services/`, `uis/`, `packages/shared/` | Inspect repository tree | PASS | Source tree |

## Additional delivery evidence (not among the 47 source checkboxes)
- The assignment separately requests a PR and three screenshots. Branch push/PR and saved screenshot files are still pending. A browser session did render registration validation and the seeded dashboard; the browser click automation stalled and the static server was later stopped, so the list population could not be captured as an evidence file.
- Clean-checkout reproduction is required by the milestone delivery request and remains pending; it is not counted as one of the source README's 47 checkboxes.
