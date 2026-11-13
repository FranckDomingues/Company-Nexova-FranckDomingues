# EH-01C Reproduction (fresh Codespace)

Verified from a clean clone of `feature/error-handling-audit` at `d0571a202c2ad4ed0f0f4994599ba222c0af956b`. The branch contains all milestone code/tests; no sibling branch or secret is needed. Commands assume Ubuntu Codespaces with Python 3.12+ and Node 18+.

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

## Optional webhook integration demonstration

No public endpoint or credential is needed. Set these variables to enable delivery to a local HTTP receiver only; remote endpoints must use HTTPS.

```bash
export NEXOVA_INCIDENT_WEBHOOK_ENABLED=true
export NEXOVA_INCIDENT_WEBHOOK_URL=http://127.0.0.1:8765/notify
```

Start the API in one terminal and upload the sample CSV from another terminal (the receiver is optional; if absent, analysis still returns success with `notification: failed`):

```bash
uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000
# second terminal
curl -i -F 'file=@incidents-analysis/incidents-nexova.csv' http://127.0.0.1:8000/api/incidents/analyze
```

To observe successful delivery locally, save this dependency-free receiver as `/tmp/nexova-webhook.py` and run it (its output shows only payload keys and aggregate values):

```bash
cat > /tmp/nexova-webhook.py <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
        print({'event': payload.get('event'), 'metric_keys': list(payload.get('metrics', {}))})
        body = b'{"accepted":true}'
        self.send_response(200); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *_args): pass
HTTPServer(('127.0.0.1', 8765), Receiver).serve_forever()
PY
python /tmp/nexova-webhook.py
```

For deterministic success/failure variants and no-retry assertions, run the local-server tests below; no external network or credentials are used.

## Run regression tests

```bash
source .venv/bin/activate
uv run --project services/api --extra dev --with pandas python -m unittest discover -s services/api/tests -v
# Optional outbound integration alone:
uv run --project services/api --extra dev python -m unittest discover -s services/api/tests -p 'test_incident_webhook.py' -v
uv run --with pandas python -m unittest discover -s scripts/tests -v
uv run --with pandas python -m unittest discover -s skills/data-analysis/tests -v
node uis/backoffice/tests/dashboard.test.js

uv run --with pandas python -m py_compile skills/data-analysis/scripts/pandas_clean.py skills/data-analysis/tests/test_pandas_clean.py scripts/analyze.py scripts/tests/test_analyze.py services/api/app/main.py services/api/app/api/routes/incidents.py services/api/app/notifications/incident_webhook.py services/api/tests/test_incidents_api.py services/api/tests/test_incident_webhook.py
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
