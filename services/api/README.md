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

## Password recovery and change (AUTH-03)

| Endpoint | Auth | Behaviour |
|---|---|---|
| `POST /auth/forgot-password` `{email}` | none | Always `200` with the same body. For an active registered account it stores a single-use reset token (SHA-256 hash only) and emails a link to `<FRONTEND_BASE_URL>/backoffice/reset-password?token=…`. Rate limited per email (silently) and per client IP (`429`). |
| `POST /auth/reset-password` `{token, new_password}` | none | Validates the token (exists, unused, not expired, issued after the last password change). On success it hashes the new password, consumes the token and revokes the user's other links. Returns `400` for invalid, expired or used tokens. |
| `POST /auth/change-password` `{current_password, new_password}` | Bearer | `401` without a valid session; `400` if the current password is wrong. |

Email is sent through Resend (`app/mailer.py`). Configure it with environment variables only (see `.env.example`):

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key. Without it the API answers generically and sends nothing. **Never commit it.** |
| `EMAIL_FROM` | Sender (default `Nexova <onboarding@resend.dev>`, Resend's testing sender, which only delivers to the Resend account owner's address) |
| `RESEND_API_BASE_URL` | Default `https://api.resend.com` |
| `FRONTEND_BASE_URL` | Origin used in reset links (default `http://127.0.0.1:5500`) |
| `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` | Link lifetime, 15–60 (default 30) |
| `PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR` / `PASSWORD_RESET_MAX_PER_IP_PER_HOUR` | Rate limits (defaults 3 / 20) |

Audit events (`password_audit_events` TinyDB table) record timestamp, IP, user agent, user id or a keyed HMAC of the email, and outcome. They never record passwords, raw tokens or email addresses. Details: `docs/evidence/AUTH-03-SECURITY-REPORT.md`.

## Supplier API

- `POST /suppliers` — create; ID and `updated_at` are server-generated.
- `GET /suppliers?country=Spain&category=ats_software` — optional country/category filters.
- `GET /suppliers/{id}` — detail.
- `PATCH /suppliers/{id}/rate` — `{"monthly_rate": 345.0}`; refreshes UTC `updated_at`.
- `PATCH /suppliers/{id}/status` — `{"status": "suspended"}`.
- `DELETE /suppliers/{id}` — delete.

Interactive OpenAPI documentation is available at `/docs` while the API is running.

## PostgreSQL inventory milestone groundwork

`DATABASE_URL` is reserved for the PostgreSQL inventory database; use the Supabase transaction-pooler URI and keep `.env` local. The database infrastructure requires PostgreSQL and TLS (`sslmode=require`); it does not use SQLite as a fallback. TinyDB remains the separate user/auth store. Inventory domain implementation is blocked until the official Nexova inventory briefing and 29-task milestone source are available; see `docs/evidence/INVENTORY-ORM-01-*` from the repository root.

## AUTH-01 verification

For a clean-clone instructor walkthrough, isolated TinyDB/password-hash bootstrap, complete automated suite, and Swagger steps, see [the AUTH-01 testing guide](../../docs/AUTH-01-TESTING.md). The evidence checklist is in [docs/evidence/auth-01.md](../../docs/evidence/auth-01.md).
