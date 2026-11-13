# Nexova API — Supplier directory

## Run

From `services/api`:

```bash
uv sync --extra dev
uv run seed
uv run uvicorn app.main:app --reload
uv run pytest
```

The default TinyDB JSON file is `services/api/data/suppliers.json` (ignored by Git). Set `SUPPLIER_DB_PATH` to use another file. `API_ALLOWED_ORIGINS` accepts comma-separated browser origins; its development default allows ports 5500 on localhost. Configure `JWT_SECRET_KEY` (at least 32 characters) and optionally `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` before starting; there is no committed production secret. User and profile data use only TinyDB tables `users` and `profiles` in that configured file.

## Authentication and accounts

- `POST /users` — public registration; creates an active `user` and one linked profile (optional `name`, `phone`, `address`).
- `GET /users` — admin-only list; `GET /users/{id}`, `PUT /users/{id}`, and `DELETE /users/{id}` are self/admin. Role and active-status changes are admin-only.
- `POST /auth/login` — OAuth2 form (`username` is email; `password`); returns a bearer JWT.
- `GET /auth/me`, `GET /profiles/me`, and `PUT /profiles/me` — authenticated account/profile endpoints.

Use `Authorization: Bearer <access_token>`. Passwords are bcrypt-hashed. JWTs are stateless, signed with HS256 and resolved against active TinyDB users.

## Supplier API

- `POST /suppliers` — create; ID and `updated_at` are server-generated.
- `GET /suppliers?country=Spain&category=ats_software` — optional country/category filters.
- `GET /suppliers/{id}` — detail.
- `PATCH /suppliers/{id}/rate` — `{"monthly_rate": 345.0}`; refreshes UTC `updated_at`.
- `PATCH /suppliers/{id}/status` — `{"status": "suspended"}`.
- `DELETE /suppliers/{id}` — delete.

Interactive OpenAPI documentation is available at `/docs` while the API is running.

## AUTH-01 verification

For a clean-clone instructor walkthrough, isolated TinyDB/password-hash bootstrap, complete automated suite, and Swagger steps, see [the AUTH-01 testing guide](../../docs/AUTH-01-TESTING.md). The evidence checklist is in [docs/evidence/auth-01.md](../../docs/evidence/auth-01.md).
