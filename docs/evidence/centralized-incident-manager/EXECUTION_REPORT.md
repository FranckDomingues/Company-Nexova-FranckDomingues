# Execution report — Centralized Incident Manager

## Acceptance run: clean clone and browser workflow (2026-11-13)
A fresh single-branch clone of the pushed feature branch was created at `/tmp/nexova-acceptance-srcnGd/repo` (HEAD `2dd889d3112fc5a6a08024247cf6ca1e3cd071fb`), without reusing the feature worktree environment or DB.

- Dependencies: created a new `.venv`; `pip install -e packages/shared -e 'services/api[test]'` and `npm ci` completed.
- Migration: `sqlite3 /tmp/nexova-acceptance-srcnGd/clean-proof.sqlite < infra/migrations/0001_create_incidents.sql` completed on an isolated fresh DB.
- Seed first run: 96 inserted, 4 invalid, 0 duplicates. Second run: 0 inserted, 4 invalid, 96 duplicates.
- Clean-clone tests: `python -m pytest -q packages/shared/tests services/api/tests` — **6 passed**; `npm test` — passed; `node --check app.js` — passed.
- Started clean clone API on `127.0.0.1:8765` with explicit isolated `DATABASE_URL`, plus static UI server at `127.0.0.1:8767`. Browser CORS/API requests worked when directly loading the incident app with `?api=http://127.0.0.1:8765/api`. The backoffice landing-page link drops that query parameter; direct query-string navigation was necessary for port overrides.
- Browser workflow: backoffice link opened incident manager; empty form displayed field-level errors. A valid synthetic test incident (#97) submitted successfully, showed confirmation, reset the form, and appeared in the list. Status, origin, and office filters returned matching rows; status moved open → in_progress → resolved and terminal status rendered `Final`. Summary refreshed to 97 total and 57 resolved. A network-aborted list request showed retry and recovered; a network-aborted summary request showed retry and recovered. An aborted PATCH retained the old displayed status and showed the rollback message. Delayed POST visibly changed the submit button to `Submitting…` and disabled it. Branch-origin selection added the `emphasized` class. No broken/blank application page was observed. The full required browser journey is verified; task 19 remains PARTIAL because a failed registration API response was covered by frontend tests but not separately exercised in the browser.
- Browser evidence: screenshots in this directory show validation errors, a populated/filterable incident list, and live summary dashboard. Browser test data is synthetic; it was run only in the isolated clean-clone DB.
- API security: no authentication middleware or user authentication was found. Scope remains local development/assignment use; deployment requires suitable authentication/authorization and network protections. No auth system was introduced.
- Historical integrity: original CSV source with customer data was not available in the clean clone, and public authorization is not established. Synthetic fixture transformation output matches briefing aggregates, but equivalence to original historical data remains **unverified**. Do not treat that proof as original-source verification.

## Verification performed
- API/shared/seed suite: `.venv/bin/python -m pytest -q packages/shared/tests services/api/tests` — **6 passed** (one Starlette/httpx deprecation warning).
- Fresh temporary SQLite database proof: ran `scripts/seed_incidents.py` twice; first run inserted 96 and rejected 4; second inserted 0 and detected 96 duplicates. Invalid counts: one each for missing client company, invalid category, invalid email, and closed-without-score.
- Summary endpoint on the isolated seeded DB returned HTTP 200 with statuses `open=27`, `resolved=56`, `discarded=13`; categories `technical_failure=49`, `process_error=35`, `client_complaint=12`; origin customer 96; branch central 96.
- API checks include CRUD/list filters, lifecycle transitions, field validation, empty summary, DB constraints, and sanitized HTTP 500 behavior.
- SQLite migration applied twice to a fresh temporary database successfully.
- Frontend DOM interaction suite: `cd uis/backoffice/incidents && npm ci --ignore-scripts && npm test` — passed required-field validation, safe API errors, loading/submission guard, branch highlight, successful form reset/confirmation, list retry/empty state, and failed status update rollback.
- JavaScript syntax: `node --check uis/backoffice/incidents/app.js` passed.
- `git diff --check` passed.

## Remaining acceptance gaps
The original CSV contained customer PII and commit authorization could not be independently established. It has been replaced with an anonymized/synthetic 100-row fixture: all emails use the reserved `.invalid` domain; company, agent, and free-text descriptions are synthetic; the four official invalid-rule cases and briefing aggregate totals remain. The seed never persists or prints customer email values.

The acceptance browser workflow was completed against the clean clone on 2026-11-13, as detailed above. Three genuine screenshots are saved alongside this report. The backoffice landing link does not preserve a custom `?api=` query parameter; testing with a non-default API origin required opening the incident app URL directly. This is a navigation limitation, not a CORS/API failure. No application source changes were required during this acceptance pass.
