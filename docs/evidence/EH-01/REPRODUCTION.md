# EH-01 Reproduction (fresh Codespace)

Commands assume Ubuntu Codespaces, repository root, Python 3.11+ and Node.js available. This selected `origin/main` base has no backend API or frontend npm project; do not run unlisted `npm test`, `pytest`, or API commands expecting them to exist. No secrets are required.

## Environment and dependencies

```bash
# Confirm the expected branch/base after checkout
git status --short --branch
git rev-parse HEAD

# Create an isolated environment and install the only runtime dependency
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install pandas
```

## Run regression tests and syntax checks

```bash
source .venv/bin/activate
python -m unittest discover -s skills/data-analysis/tests -v
python -m py_compile skills/data-analysis/scripts/pandas_clean.py skills/data-analysis/tests/test_pandas_clean.py
node --check uis/website/validation.js
git diff --check
```

There is no frontend build/lint/test package, FastAPI application, or backend test suite on this base. The UI validation is manually reproducible as follows:

```bash
# In a second terminal at repository root (Node's npx may download http-server)
npx --yes http-server uis/website -p 3000 -a 0.0.0.0
```

Open `http://127.0.0.1:3000/application.html` in the Codespace browser preview:

1. Submit the empty form. Confirm a Spanish instruction appears, field-specific errors are shown, and focus moves to “Nombre completo”. Correct fields; errors clear on input/change.
2. Enter a valid test application, including a future start date, choose service and contact preference, check consent, then submit. Confirm the UI explicitly says it only validated locally and is not yet connected to the system. No submission/network request occurs.
3. Refresh; there is no persisted or remote data to fail. Loading/retry behavior is inapplicable because no async calls exist.

## Representative script failure and success scenarios

```bash
source .venv/bin/activate

# Missing file: expect non-zero (2), safe Spanish stderr, and no traceback.
python skills/data-analysis/scripts/pandas_clean.py --input /tmp/nexova-does-not-exist.csv
printf 'exit=%s\n' "$?"

# Malformed CSV: expect non-zero (1), sanitized message, no traceback.
printf '"unclosed\nrow' > /tmp/nexova-invalid.csv
python skills/data-analysis/scripts/pandas_clean.py --input /tmp/nexova-invalid.csv
printf 'exit=%s\n' "$?"

# Successful processing with a temporary synthetic input; stdout reports counts only.
printf 'Name,Team\nDemo User,Sales\nDemo User,Sales\n' > /tmp/nexova-valid.csv
python skills/data-analysis/scripts/pandas_clean.py --input /tmp/nexova-valid.csv --output /tmp/nexova-clean.csv
printf 'exit=%s\n' "$?"
cat /tmp/nexova-clean.csv

# Output I/O failure: an output parent that does not exist returns non-zero and a safe error.
python skills/data-analysis/scripts/pandas_clean.py --input /tmp/nexova-valid.csv --output /tmp/nexova-missing-dir/clean.csv
printf 'exit=%s\n' "$?"
```

Permission-denied simulation with a non-root user, where chmod semantics apply:

```bash
printf 'Name\nDemo User\n' > /tmp/nexova-unreadable.csv
chmod 000 /tmp/nexova-unreadable.csv
python skills/data-analysis/scripts/pandas_clean.py --input /tmp/nexova-unreadable.csv
printf 'exit=%s\n' "$?"
chmod 600 /tmp/nexova-unreadable.csv
```

A process running as root may bypass the permission check. The regression suite mocks the underlying read/write I/O exception deterministically and verifies sanitized diagnostics; atomic output tests confirm that an existing target stays intact and that a missing output parent fails safely.

## What this reproduction does not claim

Backend route status/auth/security tests and async API UI scenarios are blocked, not passed: the corresponding routes and dashboard files live only in unmerged feature branches and are absent from the selected main base. See `DEPENDENCIES.md` and `CHECKLIST.md`.
