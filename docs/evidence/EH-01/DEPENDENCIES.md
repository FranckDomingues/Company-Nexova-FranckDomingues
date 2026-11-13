# EH-01C Base and Upstream Dependencies

## Selected base and integration

`feature/error-handling-audit` retains base `origin/main` `047da24ec0ac3e2ebe6972d89f26abed37acd0d5` and prior EH implementation commit `e1289b7526d44357e12f9ba0321f8a50d8a5b4ec`. It now includes a minimal, coherent set of real incident-analysis modules adapted from `origin/feature/incidents-analysis` (`44c0772...`), with complete provenance in `UPSTREAM_PROVENANCE.md`. No other branch is required at test/runtime; no merge or force push is used.

## Independent testability

A clean clone of this branch is independently testable. `services/api/pyproject.toml` declares FastAPI, HTTPX runtime, multipart, Uvicorn, and dev test-client dependencies with Python >=3.12. No credentials or external services are required. API tests use local fixtures and mocks; dashboard tests use Node's built-in VM/assert libraries; original Python CSV tests use an isolated environment and pandas. EH-01B had clean-clone evidence (API 12, analyzer 14, CSV cleaner 9, dashboard 5). EH-01C adds runtime HTTPX and tests in the same self-contained project; fresh-clone verification against the EH-01C commit remains pending until commit/push. Current local runs pass API 25, analyzer 14, CSV cleaner 9, dashboard 5; see `TEST_RESULTS.md`. Commands are in `REPRODUCTION.md`.

No separate Next.js framework/package exists, so Next.js build/type/lint checks are not applicable; the static dashboard is syntax checked and has focused automated tests. No database is needed: selected result storage is in-memory for this analysis app.

## Not included / remaining limitations

- The auth/supplier app (`origin/feature/auth-api`, `origin/feature/backend-foundation`) was not integrated; selected incident routes have no auth, so no 401/403 route behavior can be tested or claimed.
- The supplier-directory async UI and centralized incident manager are different product modules and remain outside this minimal integration. They are not prerequisites for the included dashboard/API scenario and were not tested.
- No outbound integration pre-existed in the included app. EH-01C adds a minimal, disclosed optional HTTP webhook adapter for aggregate incident-analysis results; this is the only new integration and does not add a queue/service or credentials. `httpx>=0.28.1,<1` is a runtime dependency; `httpx2` remains in the dev extra for Starlette TestClient compatibility.
- This repository does not contain a Next.js application; no Next.js-specific framework coverage is claimed.
