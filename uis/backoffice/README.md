# Nexova Incident Analysis dashboard

Small, dependency-free HTML/CSS/JavaScript dashboard for the existing incident analysis API. The browser uploads the chosen CSV only to the local Nexova API; it does not parse, persist, log, or send customer data to third-party services. The dashboard renders only aggregate values returned by the backend.

## Run locally

Use two local terminals from the repository worktree:

```sh
cd services/api
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```sh
python -m http.server 5500 --bind 127.0.0.1 --directory uis/backoffice
```

Open <http://127.0.0.1:5500/> and select `incidents-analysis/incidents-nexova.csv`. In Codespaces the dashboard converts its forwarded `-5500.app.github.dev` hostname to the same HTTPS hostname on port `-8000`; both ports must remain private and accessible through the Codespaces session. CORS allows only the two localhost origins and the exact current Codespaces dashboard origin. Do not expose the demo backend publicly or widen this development allowlist for deployment without access controls and a reviewed origin policy.

## API contract used

- `POST /api/incidents/analyze`, multipart field `file`, provides totals, `analysis_id` and aggregate metrics.
- `GET /api/incidents/results/export?analysis_id=…` provides aggregate metric rows. The download is named `results.csv`.

The interface expects the backend's existing metric names (`category:*`, `status:*`, `invalid:*`, and `satisfaction_score:1` through `:5`). Percentages use valid-record totals as calculated by the analyzer. The temporary in-memory analysis store has no per-user authorization and retains only a bounded number of results; this dashboard does not add authentication and is not production-ready.

## Validation

There is no frontend build step or additional dependency. The API's own regression tests cover the official file, invalid reasons and the 30-row aggregate export. Browser automation is not included in this lightweight implementation.
