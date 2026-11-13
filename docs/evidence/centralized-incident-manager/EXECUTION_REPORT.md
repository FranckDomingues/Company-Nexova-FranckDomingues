# Execution report — Centralized Incident Manager

## Acceptance run: clean clone and browser workflow (2026-11-13)
A fresh single-branch clone of the pushed feature branch was created at `/tmp/nexova-acceptance-srcnGd/repo` (HEAD `2dd889d3112fc5a6a08024247cf6ca1e3cd071fb`), without reusing the feature worktree environment or DB.

- Dependencies: created a new `.venv`; `pip install -e packages/shared -e 'services/api[test]'` and `npm ci` completed.
- Migration: `sqlite3 /tmp/nexova-acceptance-srcnGd/clean-proof.sqlite < infra/migrations/0001_create_incidents.sql` completed on an isolated fresh DB.
- Seed first run: 96 inserted, 4 invalid, 0 duplicates. Second run: 0 inserted, 4 invalid, 96 duplicates.
- Clean-clone tests: `python -m pytest -q packages/shared/tests services/api/tests` — **6 passed**; `npm test` — passed; `node --check app.js` — passed.
- Started clean clone API on `127.0.0.1:8765` with explicit isolated `DATABASE_URL`, plus static UI server at `127.0.0.1:8767`. Browser CORS/API requests worked when directly loading the incident app with `?api=http://127.0.0.1:8765/api`. The backoffice landing-page link drops that query parameter; direct query-string navigation was necessary for port overrides.
- Browser workflow: backoffice link opened incident manager; empty form displayed field-level errors. A valid synthetic test incident (#97) submitted successfully, showed confirmation, reset the form, and appeared in the list. Status, origin, and office filters returned matching rows; status moved open → in_progress → resolved and terminal status rendered `Final`. Summary refreshed to 97 total and 57 resolved. A network-aborted list request showed retry and recovered; a network-aborted summary request showed retry and recovered. An aborted PATCH retained the old displayed status and showed the rollback message. Delayed POST visibly changed the submit button to `Submitting…` and disabled it. Branch-origin selection added the `emphasized` class. No broken/blank application page was observed. The primary browser workflow is verified; the later clean-clone browser checks also verified safe field-level registration errors and visible list loading, closing checklist tasks #19 and #22.
- Browser evidence: screenshots in this directory show validation errors, a populated/filterable incident list, and live summary dashboard. Browser test data is synthetic; it was run only in the isolated clean-clone DB.
- API security: no authentication middleware or user authentication was found. Scope remains local development/assignment use; deployment requires suitable authentication/authorization and network protections. No auth system was introduced.
- Historical integrity was subsequently verified from the original CSV recovered from the internal analyzer Git branch. See the authentic historical-source verification section below; synthetic fixture results are not used as evidence for this verification.

## Verification performed
- API/shared/seed suite: `.venv/bin/python -m pytest -q packages/shared/tests services/api/tests` — **6 passed** (one Starlette/httpx deprecation warning).
- Fresh temporary SQLite database proof: ran `scripts/seed_incidents.py` twice; first run inserted 96 and rejected 4; second inserted 0 and detected 96 duplicates. Invalid counts: one each for missing client company, invalid category, invalid email, and closed-without-score.
- Summary endpoint on the isolated seeded DB returned HTTP 200 with statuses `open=27`, `resolved=56`, `discarded=13`; categories `technical_failure=49`, `process_error=35`, `client_complaint=12`; origin customer 96; branch central 96.
- API checks include CRUD/list filters, lifecycle transitions, field validation, empty summary, DB constraints, and sanitized HTTP 500 behavior.
- SQLite migration applied twice to a fresh temporary database successfully.
- Frontend DOM interaction suite: `cd uis/backoffice/incidents && npm ci --ignore-scripts && npm test` — passed required-field validation, safe API errors, loading/submission guard, branch highlight, successful form reset/confirmation, list retry/empty state, and failed status update rollback.
- JavaScript syntax: `node --check uis/backoffice/incidents/app.js` passed.
- `git diff --check` passed.

## Final gap-closure verification (2026-11-13)
On the clean-clone UI/API pair (UI `127.0.0.1:8767`, API `127.0.0.1:8765`, migrated isolated SQLite DB):

- Registration failure/field mapping: intercepted a POST with HTTP 400 and JSON `{field_errors: {title: "Title is not valid."}, detail: "Invalid incident data"}`. The UI displayed a friendly correction notice and the title-specific error; the raw API `detail` text was not visible. Frontend tests additionally cover generic network/server-safe feedback. Checklist #19 is now PASS.
- List loading: intercepted the incident list GET and delayed its response by 1.8 seconds. During the pending request the visible list state read `Loading incidents…`; after resolution the list loaded. Checklist #22 is now PASS.
- Final clean-clone regression: migration applied to `/tmp/nexova-close02.sqlite`; first seed run inserted 96/rejected 4, second inserted 0/reported 96 duplicates/rejected the same 4. Database row count remained 96. Backend/shared suite: 6 passed (one existing upstream Starlette/httpx deprecation warning); frontend DOM suite passed; `node --check app.js` passed. `git diff --check` passed.
- Original-data search: searched accessible project directories for incident CSVs. Only the explicitly synthetic fixture `data/raw/incidents-nexova.csv` (100 rows including header) was found. It must not be treated as original customer data.

## Authentic historical-source verification (2026-11-13)
The original source was located on the internal Git branch `origin/feature/incidents-analysis`, path `incidents-analysis/incidents-nexova.csv`, introduced by commit `aa56b1ad0e0672a3dd8056a6ab201097850a188c` (Git blob `388f4bd85612b8748edf6dc0028c0882992fe460`). Source provenance was checked against that branch's analyzer commit and `incidents-analysis/nexova-BRIEFING.md`. The file was extracted only into a `0700` temporary directory outside the repository, with file mode `0600`; processing used an isolated temporary SQLite database, and the temporary directory (including CSV and database) was deleted after verification. No individual customer fields or source records were printed, uploaded, or committed.

Non-sensitive file metadata: 13,493 bytes, 100 data rows, SHA-256 `dadd5a0b65eebff2a395f672afb94c1d931db7918b711f98ee80e1319b5e8cb8`. Header matched the shared validator's expected fields. Authentic-source results: 96 valid/inserted and 4 rejected. Rejection reasons: 1 missing client_company, 1 invalid/missing category, 1 invalid/missing email, 1 closed ticket without satisfaction score. The second seed run inserted 0 and reported 96 duplicates (same 4 invalid rows).

Every persisted transformed row was compared against the transformation function applied to the corresponding source row; there were 0 field mismatches. All 96 persisted records have origin `customer` and branch `central`. Mapped statuses: `open=27`, `resolved=56`, `discarded=13`. Mapped categories: `technical_failure=49`, `process_error=35`, `client_complaint=12`. Created dates span 2024-01-01 to 2024-01-31 UTC; title lengths range 39–54 characters, consistent with the seed's description-derived title rule. These mapped totals reconcile exactly to the original briefing totals after the documented category/status mappings. Temporary source and database were removed after the run. The tracked `data/raw/incidents-nexova.csv` remains an explicitly synthetic fixture.

## Final acceptance status
Official checklist: **47 PASS / 0 PARTIAL / 0 FAIL**. The clean-clone browser workflow and three genuine screenshots remain as documented above. Backoffice landing navigation does not preserve a custom `?api=` query parameter; testing with a non-default API origin required direct incident-app navigation, while actual cross-origin browser/API requests succeeded. The API remains unauthenticated and scoped to local assignment development; production deployment requires authentication/authorization and network protections. No application source change was needed for authentic-data verification.
