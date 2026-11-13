# Nexova backoffice — Supplier directory

This is the internal lightweight backoffice page for managing the Nexova supplier directory. It uses the existing monorepo's vanilla HTML/JavaScript conventions and Tailwind CDN styling.

## Run locally

1. In `services/api`, run `uv run seed` to load the briefing's initial directory, then `uv run uvicorn app.main:app --reload`.
2. Serve this directory with a static web server, for example `npx --yes http-server uis/backoffice -p 5500`.
3. Open `http://127.0.0.1:5500/`. For a different API URL, set `window.NEXOVA_API_URL` before `suppliers/supplier-directory.js` loads.

API CORS origins can be adjusted using the comma-separated `API_ALLOWED_ORIGINS` environment variable. The database file path can be overridden with `SUPPLIER_DB_PATH`.

The directory supports country/category filters, supplier creation, rate updates and status changes. The existing public `uis/website` remains untouched.
