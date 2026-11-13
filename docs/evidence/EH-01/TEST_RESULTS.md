# EH-01 Test Results

**Tested base:** `origin/main` / `047da24ec0ac3e2ebe6972d89f26abed37acd0d5`
**Environment used:** macOS host used for implementation, Python 3.12.16 in `.venv`, pandas 3.1.1, Node 24.18.0. Codespace reproduction commands are in `REPRODUCTION.md`.

## Baseline (before implementation)

- No project test commands/package scripts/root dependencies were present on `origin/main`.
- `python3 -m pytest --version` failed: pytest not installed.
- Python 3.10 default host interpreter could not import pandas; configured Python 3.12 was used to create `.venv` and install pandas.
- Static JS site has no npm manifest or frontend test runner; no automated browser suite was configured.
- No FastAPI tests or route modules existed on the selected base.

## After implementation

| Check | Result | Detail |
|---|---|---|
| Python regression tests | PASS | `.venv/bin/python -m unittest discover -s skills/data-analysis/tests -v` — 9 tests passed. Covers success, no sensitive row output, missing file, malformed and empty CSV, sanitized read I/O failure, failed atomic output preserving prior file/removing temporary file, invalid output directory, same-path input/output guard, and missing output-parent I/O failure. |
| Python syntax | PASS | `python -m py_compile skills/data-analysis/scripts/pandas_clean.py skills/data-analysis/tests/test_pandas_clean.py` (Python 3.12 virtualenv). |
| Frontend JS syntax | PASS | `node --check uis/website/validation.js`. |
| Form behavior, invalid-submit recovery | PASS (manual browser) | Submitted empty form in integrated browser: Spanish actionable summary, 14 marked invalid controls, focus on `contact-name`. |
| Form behavior, valid submit | PASS (manual browser) | Filled all required fields and submitted; Spanish confirmation explicitly states request is validated only and awaits system connection. |
| `git diff --check` | PASS | No whitespace errors. |
| Frontend suite/lint/type/build | NOT RUN / NOT AVAILABLE | No `package.json`, frontend framework manifest, or configured command exists on this base. |
| Backend route/status/security tests | BLOCKED | No backend implementation in `origin/main`; do not infer tests from the unmerged branches. |
| Script permission denied as OS user | PARTIALLY COVERED | Regression tests deterministically simulate read and write I/O errors. The live chmod reproduction is provided; host permission behavior can vary if process is root. |

## Important first-run note

The first `unittest` run used the system Python 3.10 (no pandas) and failed due to the runtime dependency missing in that interpreter. The regression run with the documented `.venv` and pandas 3.1.1 passed. No project files were installed outside the disposable virtual environment.
