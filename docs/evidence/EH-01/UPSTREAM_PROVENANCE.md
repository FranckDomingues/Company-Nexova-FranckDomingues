# EH-01C Upstream Provenance

## Source and selection

The milestone branch remains based on `origin/main` commit `047da24ec0ac3e2ebe6972d89f26abed37acd0d5`; the original EH-01 implementation commit `e1289b7526d44357e12f9ba0321f8a50d8a5b4ec` is preserved in history. We selectively adapted the coherent incident-analysis feature from `origin/feature/incidents-analysis`, inspected at commit `44c0772` (all inspected branches were based on `origin/main`). No feature branch was merged, no PR feature was claimed as tested before integration, and no upstream branch was modified.

## Included paths and rationale

| Source path(s) | Included/adapted path(s) | Why essential |
|---|---|---|
| `services/api/app/api/routes/incidents.py`, `incident_results.py`, package initializers, `services/api/app/main.py` | Same `services/api/app/...` paths | Real FastAPI app and upload/export handlers are the actual backend execution boundary for error statuses and response-leak tests. `main.py` was adapted for sanitized structured errors. |
| `services/api/tests/test_incidents_api.py` | Same path, extended | Existing API contract/regression suite exercises real handlers; extended with validation, I/O, 413, and canary error tests. |
| Upstream service dependency manifest (`services/api/pyproject.toml`, Python >=3.14) | New minimal `services/api/pyproject.toml`, Python >=3.12 | The source manifest required Python 3.14, which was unavailable in the target macOS host and unnecessary for these modules. A focused supported dependency set makes clean-clone API tests reproducible without unrelated packages. |
| `scripts/analyze.py`, `scripts/tests/test_analyze.py`, `incidents-analysis/incidents-nexova.csv` | Same paths; CLI and atomic export adapted | Analyzer is dynamically imported by the API and its test fixture is required for meaningful successful upload tests. It is actual file/CSV behavior, not a demo endpoint. |
| `uis/backoffice/{index.html,styles.css,dashboard.js,README.md}` | Same paths; dashboard request and message handling adapted | This is the real frontend that calls incident analysis and export endpoints; needed for async loading/error/retry/null-data coverage. Added a dependency-free Node VM harness at `uis/backoffice/tests/dashboard.test.js`. |

The pre-existing `skills/data-analysis/...` EH-01 script, tests, and evidence were preserved unchanged in purpose and continue to be tested. CI was extended only to run these milestone-specific suites.

## Not integrated

- `origin/feature/auth-api` and its database/auth/supplier stack were reviewed but were not needed for the incident-analysis handler. The selected incident app has no authentication routes; this branch does not claim 401/403 enforcement tests.
- `origin/feature/backend-foundation` and `origin/feature/supplier-directory` were not integrated because their setup/routes are not dependencies of the selected API.
- `origin/feature/centralized-incident-manager` was not selected: it introduces separate CRUD/database behavior outside the smallest coherent closure.
- No suitable pre-existing server-to-server external HTTP integration existed in the included app or inspected source branches. EH-01C adds only `services/api/app/notifications/incident_webhook.py`, a new optional, aggregate-only adapter as the narrowly scoped fallback explicitly required by the milestone. The route and adapter tests are authored in this branch; no external integration code was copied from another branch. `httpx>=0.28.1,<1` was added as the sole runtime dependency required for the real HTTP client; `httpx2>=2,<3` remains only as the dev-only Starlette TestClient compatibility dependency.

## Verification boundary

Tests run in this branch execute the copied/adapted files and local fixtures in a fresh environment; they do not check out or execute another branch. Refer to `TEST_RESULTS.md` for exact commands/outcomes and limitations. This integration provides incident-analysis API/dashboard coverage, not an assertion that every unrelated Nexova feature branch has been merged or audited.
