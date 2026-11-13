# EH-01B Reproduction (fresh Codespace)

A clean checkout of `feature/error-handling-audit` contains all milestone code/tests; no sibling branch or secret is needed. Commands assume Ubuntu Codespaces with Python 3.12+ and Node 18+.

## Environment and dependencies

```bash
git clone https://github.com/FranckDomingues/Company-Nexova-FranckDomingues.git
cd Company-Nexova-FranckDomingues
git checkout feature/error-handling-audit
git status --short --branch

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e 'services/api[dev]' pandas
export PYTHONPATH="$PWD/services/api"
```

## Run regression tests

```bash
source .venv/bin/activate
python -m unittest discover -s services/api/tests -v
python -m unittest discover -s scripts/tests -v
python -m unittest discover -s skills/data-analysis/tests -v
node uis/backoffice/tests/dashboard.test.js

python -m py_compile skills/data-analysis/scripts/pandas_clean.py skills/data-analysis/tests/test_pandas_clean.py scripts/analyze.py scripts/tests/test_analyze.py services/api/app/main.py services/api/app/api/routes/incidents.py services/api/tests/test_incidents_api.py
node --check uis/website/validation.js
node --check uis/backoffice/dashboard.js
node --check uis/backoffice/tests/dashboard.test.js
git diff --check
```

The static dashboard is tested with a dependency-free Node VM harness. Optional live reproduction (run from repository root, in two terminals):

```bash
python -m uvicorn app.main:app --app-dir services/api --host 0.0.0.0 --port 8000
npx --yes http-server uis/backoffice -p 5500 -a 0.0.0.0
```

Open the forwarded dashboard port, upload the included `incidents-analysis/incidents-nexova.csv`, and verify analysis/export. For structured failure responses:

```bash
curl -i -F 'file=@/tmp/nexova-invalid.csv;filename=invalid.csv' http://127.0.0.1:8000/api/incidents/analyze
curl -i 'http://127.0.0.1:8000/api/incidents/results/export?analysis_id=unknown'
curl -i 'http://127.0.0.1:8000/api/incidents/results/export'
```

## Representative script failure and success scenarios

```bash
source .venv/bin/activate

# Missing file: expect non-zero and safe stderr with no path or traceback.
python skills/data-analysis/scripts/pandas_clean.py --input /tmp/nexova-does-not-exist.csv
printf 'exit=%s\n' "$?"

# Incident analyzer missing file: expect exit 1 and a sanitized error type only.
python scripts/analyze.py /tmp/nexova-does-not-exist.csv </dev/null
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

# Incident analyzer successful CLI (answer n): expect exit 0.
printf 'n\n' | python scripts/analyze.py incidents-analysis/incidents-nexova.csv
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

## Scope and limitations

The 500 error boundary is tested by mocking an unexpected analyzer exception rather than adding a debug endpoint; canary secret, traceback and private path are asserted absent from the returned body. Auth-specific statuses are outside the integrated incident app, and the app contains no external API calls. No Next.js toolchain exists. These are documented scope limitations, not claimed tests. See `DEPENDENCIES.md`, `CHECKLIST.md`, and `UPSTREAM_PROVENANCE.md`.
