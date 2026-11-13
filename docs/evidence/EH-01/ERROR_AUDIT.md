# EH-01 Error Handling Audit

**Base:** `origin/main` (`047da24ec0ac3e2ebe6972d89f26abed37acd0d5`), with the incident-analysis application selectively integrated from `origin/feature/incidents-analysis` (`44c0772...`). Existing EH-01 script hardening at `e1289b7` is retained. Source selection/provenance is documented in `UPSTREAM_PROVENANCE.md`.

## Scope and inventory

The selected `main` base is a static public site plus Python utility; it has no Next.js application. The milestone branch additionally contains the coherent real incident-analysis API/dashboard and CSV analyzer selectively integrated from `feature/incidents-analysis`. The original application form still validates locally and does not send data; `agents/_template/agent.py` is empty. The included backoffice dashboard makes actual async analysis and export requests. API details and source paths are in `UPSTREAM_PROVENANCE.md`.

| Severity | Location | Finding | Action |
|---|---|---|---|
| Medium (fixed) | `skills/data-analysis/scripts/pandas_clean.py` | Initially read a fixed CSV with raw exceptions and printed sample data. | CLI validation, bounded sanitized errors, exit codes, aggregate-only output, atomic output and regression coverage added in original EH-01. |
| High (fixed) | `services/api/app/main.py` | Framework validation and unexpected failures could expose raw details/default traceback behavior; status JSON shape was inconsistent. | Added structured sanitized 422/HTTP/500 handlers; retain safe server-side diagnostic type only; canary-tested. |
| High (fixed) | `services/api/app/api/routes/incidents.py` | Upload file I/O errors could escape as unhandled failures; parse failures could retain chained context; export missing IDs need 404. | Scoped upload error handling (400/413/500), safe logging, no chained parse details, existing export 404; regression tests. |
| Medium (fixed) | `uis/backoffice/dashboard.js` | Successful response JSON parse could reveal raw parser details; arbitrary thrown messages could be surfaced. | Added narrow JSON parse/shape checks and fixed Spanish fallback for unexpected errors; loading cleanup in `finally`; automated request regressions. |
| Low | `uis/website/validation.js:4,40-43` | Logs structural page-integration diagnostics only; messages contain fixed element IDs. | Retained; no user values or secrets logged. |
| Medium (fixed EH-01C) | `services/api/app/notifications/incident_webhook.py`; `services/api/app/api/routes/incidents.py` | The selected analysis API originally had no outbound HTTP integration, leaving EH-B04 N/A. | Added a clearly disclosed optional aggregate-only webhook adapter. Bounded timeouts and response parsing, safe error categories, no retries/redirects, privacy-safe logs, HTTPS for remote endpoints, loopback-only local HTTP. Analysis success is not changed by optional delivery failure. See `EXTERNAL_API_HANDLING.md`. |

## Enumerated paths

- **Fetch/API:** `uis/backoffice/dashboard.js` contains POST analysis and GET aggregate export `fetch` operations. The async tests mock real request outcomes without adding artificial endpoints or dependencies.
- **Async data operations:** dashboard upload analysis and export; public form validation remains synchronous. Analysis deduplicates overlapping submissions and clears state in `finally`.
- **Error boundary:** no React/Next.js app or React error boundary exists; the actual included static dashboard handles request boundaries.
- **Backend routes/services:** `services/api/app/main.py` includes health and incident router; route modules implement analysis upload and in-memory aggregate export. Tests use FastAPI `TestClient`.
- **External API, exception handlers, logging:** EH-01C adds an optional outbound incident-result HTTP webhook (new adapter, not a pre-existing upstream integration). It sends aggregate metrics only, is disabled by default, and logs only stable category/status. API handlers cover validation, HTTP and unexpected exceptions; logs record exception class, not raw message/path/content. JS no console error output from the async flow.
- **File/CSV operations:** original pandas cleaner and integrated `scripts/analyze.py`; API writes uploads to temporary directories; analyzer export uses atomic replacement.
- **CLI entry points/tests:** original CLI has standard-library unittest coverage; analyzer has its own tests; API uses FastAPI test client; dashboard harness uses Node built-ins. No Next.js build/lint/type check applies.

## Checklist status

See [CHECKLIST.md](CHECKLIST.md) for each of the 23 required IDs and evidence. Checklist dispositions now apply to the integrated feature scope, not to `main` alone. Auth-specific 401/403 routes remain outside this integrated incident-analysis application. EH-B04 is now covered by the optional adapter described above; external integration is not claimed to have pre-existed.
