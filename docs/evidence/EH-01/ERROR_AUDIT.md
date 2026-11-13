# EH-01 Error Handling Audit

**Base:** `origin/main` (`047da24ec0ac3e2ebe6972d89f26abed37acd0d5`), inspected in isolation on `feature/error-handling-audit`.

## Scope and inventory

The chosen base is a static public site plus two Python source files. It contains no Next.js application, API client, asynchronous data loader, FastAPI application, external API integration, or server-side route. The existing application form is a client-side validation demonstration; submit does not send or persist data. `agents/_template/agent.py` is empty. The only runnable Python utility is `skills/data-analysis/scripts/pandas_clean.py`.

| Severity | Location | Finding | Action |
|---|---|---|---|
| Medium | `skills/data-analysis/scripts/pandas_clean.py:5-30` | Reads a fixed CSV with no CLI/input validation or friendly I/O/CSV diagnostics; exceptions emit tracebacks. | Add CLI validation, bounded exception handling, sanitized stderr, explicit exit codes and atomic optional output. |
| Medium | `skills/data-analysis/scripts/pandas_clean.py:9-30` | Prints dtypes, column names, and sample rows; sample values may include personal or confidential data. | Keep success output to non-sensitive aggregate counts; never print records. |
| Low | `uis/website/validation.js:4,40-43` | Logs structural page-integration diagnostics to the browser console. Messages contain only fixed element IDs, not user input or secrets. | Retain safe diagnostics; do not log field values. |
| Low | `uis/website/validation.js:546-562` | Submit validates locally only; there is intentionally no request, loading state, network failure or retry flow. | Preserve the explicitly simulated behavior and ensure validation errors explain how to recover. No fictitious async workflow introduced. |

## Enumerated paths

- **Fetch/API:** no `fetch`, XHR, Axios, API SDK, or route in `origin/main`.
- **Async data operations:** none. Form submit and validation are synchronous; reset schedules only a UI cleanup with `requestAnimationFrame`.
- **Error boundary:** none; no React/Next.js application exists in this base.
- **Backend routes/services:** none in the selected base. API code found in `feature/auth-api`, incident endpoints in `feature/incidents-analysis`, and a supplier UI/API in feature branches are unmerged and are not part of this implementation or its tests.
- **External API, exception handlers, logging:** no application external integrations or Python exception handlers. The JS console messages are static structure diagnostics; the Python script prints datasets to stdout and is changed to aggregate-only output.
- **File/CSV operations:** one `pandas.read_csv("data.csv")` call in the analysis script; no prior output file operation.
- **CLI entry points/tests:** the pandas script executes at import/top level, has no arguments or tests. No frontend package/test toolchain, root test command, or repository project manifest exists. Python tests are added using the standard `unittest` runner.

## Checklist status

See [CHECKLIST.md](CHECKLIST.md) for each of the 23 required IDs and evidence. Backend/API and frontend async checks that require absent code paths are explicitly `NOT_APPLICABLE`, not inferred passes.
