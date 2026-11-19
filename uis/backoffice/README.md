# Nexova backoffice — Supplier directory

This is the internal lightweight backoffice page for managing the Nexova supplier directory. It uses the existing monorepo's vanilla HTML/JavaScript conventions and Tailwind CDN styling.

## Run locally

1. In `services/api`, run `uv run seed` to load the briefing's initial directory, then `uv run uvicorn app.main:app --reload`.
2. Serve the backoffice with its server: `cd uis/backoffice/inventory && npm ci && npm run build && npm run serve`.
3. Open `http://127.0.0.1:5500/backoffice/`. For a different API URL, start the server with `NEXOVA_API_URL=http://host:port`.

**Authentication (AUTH-02):** this is a private page. Without a valid session it redirects to
`/backoffice/login`. The token (`localStorage`, key `nexova.auth.token`) is validated with `GET /auth/me`
before the directory is shown, and every request sends `Authorization: Bearer`. The supplier API requires the
`manager` or `admin` role. Other accounts see a permissions message (HTTP 403) and stay signed in, while an HTTP 401
signs the user out.

API CORS origins can be adjusted using the comma-separated `API_ALLOWED_ORIGINS` environment variable. The database file path can be overridden with `SUPPLIER_DB_PATH`.

The directory supports country/category filters, supplier creation, rate updates and status changes. The existing public `uis/website` remains untouched.
