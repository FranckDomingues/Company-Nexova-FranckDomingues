# EH-01 Completion Checklist

Statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT_APPLICABLE**. N/A means the relevant path is demonstrably absent from the coherent integrated scope; it is not a tested pass.

**Scope:** The branch starts at `origin/main` and selectively integrates the real incident-analysis API and dashboard from `origin/feature/incidents-analysis` commit `44c0772...`; see `UPSTREAM_PROVENANCE.md`. This does not integrate the separate auth, supplier-directory, or centralized incident-manager products.

## Frontend

| ID | Status | Evidence |
|---|---|---|
| EH-F01 | PASS | Actual `uis/backoffice/dashboard.js` POST and export GET handle network rejection, non-2xx status, malformed JSON and response shape with narrowly scoped handling. `node uis/backoffice/tests/dashboard.test.js` verifies 503, network, and invalid JSON cases. |
| EH-F02 | PASS | Dashboard exposes processing/status, completed results, and actionable error states for its async analysis and export operations; async UI tests exercise pending, success, and failure. |
| EH-F03 | PASS | Both public form and dashboard use safe fixed Spanish messages. Unexpected exception details are not interpolated into UI; dashboard tests include canary exception and parser failures. |
| EH-F04 | PASS | Public form identifies corrections; dashboard advises retry/service availability/support and allows retry after failure. Tests exercise failure then retry. |
| EH-F05 | PASS | Dashboard uses guarded file access, validates nested `metrics`, and uses null-safe defaults; regression covers `average_satisfaction: null` and zero-valid-record rendering. |
| EH-F06 | PASS | Nullish metric fallbacks render explicit `0`/`N/D`; malformed top-level metrics are rejected rather than silently normalized. Verified by dashboard regressions. |
| EH-F07 | PASS | Analysis/export flags are restored in `finally`; upload has duplicate-submit guard and drops a response if the selected file changed in-flight. Regression verifies stale result is discarded along with button cleanup on HTTP/network/JSON errors. |

## Backend

| ID | Status | Evidence |
|---|---|---|
| EH-B01 | PASS | `services/api/app/api/routes/incidents.py` scopes CSV parse and upload I/O handling around the upload/analyzer boundary; tests cover CSV 400 and I/O 500. Global handlers cover framework/otherwise-unhandled boundaries. |
| EH-B02 | PASS | Routes and handlers return structured JSON errors: 400 invalid CSV, 404 missing result, 413 upload limit, 422 request validation, 500 unexpected/I/O. No authentication route exists in this integrated app; 401/403 preservation is not applicable to these routes. `services/api/tests/test_incidents_api.py` passes. |
| EH-B03 | PASS | Generic and validation handlers omit details; HTTP handler maps safe messages while preserving status/headers. Canary tests assert no secret, traceback, or path in responses; logs contain exception type only. |
| EH-B04 | NOT_APPLICABLE | Source inventory of integrated `services/api/app` has no outbound HTTP client/external API integration; no artificial integration/retry was added. |

## Python scripts

| ID | Status | Evidence |
|---|---|---|
| EH-S01 | PASS | Both `skills/data-analysis/scripts/pandas_clean.py` and integrated `scripts/analyze.py` use sanitized failure diagnostics. Original script tests cover missing/malformed/read/write errors; Integrated analyzer subprocess tests cover missing input, malformed headers, export I/O failure, EOF, sanitized stderr and exit codes; atomic export behavior is also exercised. |
| EH-S02 | PASS | Original CLI subprocess tests assert zero/nonzero statuses; integrated analyzer subprocess tests verify zero on success and nonzero with sanitized stderr on missing file, malformed CSV, export I/O error, and EOF. |
| EH-S03 | PASS | Both scripts validate input structure before successful processing; original CLI tests cover missing/empty/malformed inputs and atomic write failure. `scripts/analyze.py` export uses temporary output + replace. |

## General security

| ID | Status | Evidence |
|---|---|---|
| EH-G01 | PASS | Python CLI diagnostics and API logs omit raw error strings/paths/row data; API canary tests verify response sanitation. Dashboard displays only known-safe error messages. Existing website console messages contain only static element IDs. |

## Final evaluation

| ID | Status | Evidence |
|---|---|---|
| EH-V01 | PASS | Dashboard tests verify pending, successful, HTTP failure, network failure, malformed JSON, retry, and cleanup; no other async frontend data operations found in included UI. |
| EH-V02 | PASS | Included form and dashboard use Spanish recovery-oriented messages; unexpected exception and parser details are hidden (dashboard canary tests). |
| EH-V03 | PASS | API routes scope expected parsing/I/O catches; global API exception handling is limited to validation, HTTP, and final unexpected-error boundaries; frontend catches only request/parse/render workflow errors. |
| EH-V04 | PASS | `finally` resets analysis/export button state; frontend tests assert reset after failures. |
| EH-V05 | PASS | Dashboard metric nullish defaults and malformed response validation are covered by rendering regressions. |
| EH-V06 | PASS | API suite covers 400/404/413/422/500. Auth 401/403 routes do not exist in integrated scope. |
| EH-V07 | PASS | Runtime and validation canaries confirm no secret/path/traceback in JSON error responses; generic logs include exception class only. |
| EH-V08 | PASS | Original script suite covers success and missing/malformed/read/write failures with exit codes. Integrated analyzer Python tests and API upload I/O regression also pass. |
