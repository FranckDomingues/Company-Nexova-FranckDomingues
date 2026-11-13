# EH-01 Test Results

**Tested base:** `origin/main` / `047da24ec0ac3e2ebe6972d89f26abed37acd0d5`, retaining EH-01 commit `e1289b7` and integrating selected incident-analysis paths from `origin/feature/incidents-analysis` commit `44c0772...`.
**Environment used:** macOS, Python 3.12.16, Node 24.18.0. Dependencies installed with `uv` in disposable environments. Clean Codespace reproduction commands are in `REPRODUCTION.md`.

## Baseline (before implementation)

- No project test commands/package scripts/root dependencies were present on `origin/main`.
- `python3 -m pytest --version` failed: pytest not installed.
- Python 3.10 default host interpreter could not import pandas; configured Python 3.12 was used to create `.venv` and install pandas.
- Static JS site has no npm manifest or frontend test runner; no automated browser suite was configured.
- No FastAPI tests or route modules existed on the selected base.

## EH-01B tests executed

| Check | Result | Detail |
|---|---|---|
| Original EH-01 script suite | PASS | `python -m unittest discover -s skills/data-analysis/tests -v` — 9 tests pass, including missing/malformed/empty input, safe stderr, I/O failure, atomic output and subprocess exit status. |
| Incident API suite | PASS | `PYTHONPATH=services/api python -m unittest discover -s services/api/tests -v` — 12 tests pass: health/success/export, 400 malformed/empty/extension, 404 missing export, 413 size boundary (limit patched for test), 422 request validation, 500 mocked unexpected and upload I/O, and no error detail leakage. |
| Integrated analyzer suite | PASS | `python -m unittest discover -s scripts/tests -v` — 14 tests pass against included fixture, CSV behavior, and CLI missing/malformed/I/O/EOF/exit-code scenarios. |
| Dashboard async regressions | PASS | `node uis/backoffice/tests/dashboard.test.js` — 5 scenarios pass: loading + 503 + cleanup, network failure then retry/success, nullish data rendering, stale-selection response discard, invalid JSON and unexpected exception sanitation. |
| Python syntax | PASS | `py_compile` over original utility, analyzer, API and tests. |
| JavaScript syntax | PASS | `node --check` on existing website validation, dashboard and new test harness. |
| `git diff --check` | PASS | No whitespace errors in final verification. |
| Existing configured lint/type/build | NOT AVAILABLE | No Next.js app/package manifest, TS compiler, or separate lint/build command exists for this static dashboard/API closure. No such checks are represented as passing. |
| Permission failure as OS user | PARTIAL | Deterministically mocked read/write `OSError` tests pass; live chmod is environment-dependent. |

## First-run and compatibility notes

A first API test discovery attempted to use the then-current Starlette `TestClient` with legacy `httpx`; newer Starlette requires `httpx2`. The dependency was corrected in `services/api/pyproject.toml` to the published compatible major version before final test reruns. A test initially expected an inappropriate export route method and got 405; that expectation was removed. Python dependencies were installed in disposable uv environments; no credentials or production services were used.
