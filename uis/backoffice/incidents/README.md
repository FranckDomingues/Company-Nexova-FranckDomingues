# Nexova incident manager UI

A framework-free responsive operations UI integrated with the existing backoffice navigation. Serve the repository root with any static HTTP server, e.g. `python -m http.server 5500`; navigate to `/uis/backoffice/incidents/`. The UI expects the API at `http://127.0.0.1:8000/api`; set `window.NEXOVA_API_URL` before `app.js` to override it.

Views: summary dashboard, filtered incident queue, validated registration form. API failures are handled without leaking server internals; failed status updates restore the previous visible status.

Run UI interaction tests: `cd uis/backoffice/incidents && npm ci && npm test`. Tests cover required-field validation, safe API failures, loading/submission protection, branch highlighting, successful reset/confirmation, list retry/empty state, and status-update rollback using jsdom.
