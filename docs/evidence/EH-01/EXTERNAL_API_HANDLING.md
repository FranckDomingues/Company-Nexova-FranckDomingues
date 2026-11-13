# EH-01C — Optional outbound incident notification

## Integration and provenance

No suitable server-to-server external HTTP integration existed in the selected Nexova incident-analysis implementation or inspected upstream feature branches. EH-01C therefore adds the expressly permitted fallback: a new, optional webhook adapter for completed incident analysis. This is not represented as pre-existing functionality.

The adapter is `services/api/app/notifications/incident_webhook.py`. The narrow `IncidentNotificationPort` contract separates notification delivery from domain analysis. `/api/incidents/analyze` invokes its HTTP implementation after analysis and aggregate result storage. Delivery status is additive (`disabled`, `delivered`, or `failed`); expected transport/configuration/remote failures do not alter the successful analysis response or saved results.

## Configuration and privacy

- `NEXOVA_INCIDENT_WEBHOOK_ENABLED` defaults to false; accepted truthy settings are `1`, `true`, `yes`, and `on` (case-insensitive).
- `NEXOVA_INCIDENT_WEBHOOK_URL` is required only while enabled. Remote destinations must use HTTPS. Plain HTTP is accepted only for loopback (`localhost`/loopback IP) for local demonstrations and tests.
- URL userinfo and fragments are rejected. Non-global literal IPs are rejected for remote HTTPS targets.
- No API key is required or supported. Redirects are disabled.
- Payload has only event name, analysis ID, total/valid/invalid counts, and average satisfaction. It does not contain CSV records, customer names, descriptions, email addresses, or credentials.
- Responses are limited to 16 KiB and require HTTP 204 or JSON `{"accepted": true}`. JSON is streamed and bounded before parsing.

## Failure contract

The adapter returns a stable internal `DeliveryCategory`: disabled, delivered, configuration error, connection error, timeout, remote rejected (4xx, including 429), remote unavailable (5xx), or invalid response. Endpoint and response text are not propagated. Server logs contain only category and status code; client responses expose only the safe delivery status. Explicit connect/read/write/pool timeouts are bounded. HTTP POST is attempted exactly once. There are no automatic retries: when a timeout follows remote acceptance, another POST could duplicate a side effect. The idempotency key is the analysis ID, but it is not treated as a justification for implicit retries.

## Exact test commands

From repository root after the documented `services/api[dev]` and pandas dependency setup:

```bash
export PYTHONPATH="$PWD/services/api"
python -m unittest discover -s services/api/tests -v
python -m unittest discover -s scripts/tests -v
python -m unittest discover -s skills/data-analysis/tests -v
node uis/backoffice/tests/dashboard.test.js
```

The webhook-specific deterministic cases are in `services/api/tests/test_incident_webhook.py`; API-level failure isolation is in `test_incidents_api.py`. They use an in-process local HTTP server, a refused loopback port, and a local stalled TLS handshake/read response. They need no public internet, paid endpoint, token, or production data.

Coverage includes successful POST/payload inspection, 204, disabled, missing/invalid settings, refused connections, connect/read timeouts, HTTP 400/429/500/503, malformed and unexpected response bodies/content types, oversized responses, safe logging and API-response canaries, no duplicate request on failures, and successful analysis despite delivery failure.

## Executable local demonstration

Follow “Optional webhook integration demonstration” in `REPRODUCTION.md`: run the provided dependency-free local receiver on `127.0.0.1:8765`, enable the two environment variables, then POST the included sample CSV to the local FastAPI app. The receiver prints only event and metric keys. Stop the receiver and repeat: analysis still succeeds and reports `notification: failed`. No secrets are involved.

## Reusable components

Future Nexova integrations can reuse the narrow notification port, immutable aggregate DTO, safe delivery categories, endpoint validation, bounded timeouts/response parsing, one-shot delivery semantics, and local-server tests. Domain code can depend on `IncidentNotificationPort` rather than HTTPX; another adapter can implement that port without changing analysis behavior.

EH-B04 is PASS because this is an actual outbound HTTP POST exercised over local TCP/HTTP, not a mocked return value or artificial test endpoint. Every required failure family has deterministic evidence, and optional failure isolation is asserted through the real FastAPI route.
