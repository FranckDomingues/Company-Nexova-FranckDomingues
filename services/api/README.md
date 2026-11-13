# Nexova API — Supplier directory

## Run

From `services/api`:

```bash
uv sync --extra dev
uv run seed
uv run uvicorn app.main:app --reload
uv run pytest
```

The default TinyDB JSON file is `services/api/data/suppliers.json` (ignored by Git). Set `SUPPLIER_DB_PATH` to use another file. `API_ALLOWED_ORIGINS` accepts comma-separated browser origins; its development default allows ports 5500 on localhost.

## Supplier API

- `POST /suppliers` — create; ID and `updated_at` are server-generated.
- `GET /suppliers?country=Spain&category=ats_software` — optional country/category filters.
- `GET /suppliers/{id}` — detail.
- `PATCH /suppliers/{id}/rate` — `{"monthly_rate": 345.0}`; refreshes UTC `updated_at`.
- `PATCH /suppliers/{id}/status` — `{"status": "suspended"}`.
- `DELETE /suppliers/{id}` — delete.

Interactive OpenAPI documentation is available at `/docs` while the API is running.
