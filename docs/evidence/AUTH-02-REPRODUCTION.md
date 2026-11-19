# AUTH-02 — Reproduction guide (macOS)

These steps reproduce AUTH-02 from a clean clone on macOS with Terminal (zsh or bash). Every command block starts from the repository root. No secret appears in this guide. You create your own values when prompted.

## 1. Prerequisites

| Tool | Version used | Install / check |
|---|---|---|
| Git and GitHub CLI | any recent | `git --version` |
| Node.js | 22 or later (the E2E runner uses the global `WebSocket`) | `node --version` (e.g. `brew install node@22`) |
| Python + uv | Python 3.11 or later | `uv --version` (`brew install uv`) |
| Docker Desktop | running | `docker info` (only for the automated E2E run) |
| Google Chrome | installed in `/Applications` | only for the automated E2E run (`CHROME_PATH` overrides the location) |

## 2. Get the branch

```sh
git clone https://github.com/FranckDomingues/Company-Nexova-FranckDomingues.git
cd Company-Nexova-FranckDomingues
git switch feature/auth-frontend
```

## 3. Automated verification (recommended for grading)

```sh
# Backend regression (unchanged by AUTH-02)
cd services/api && uv sync --extra dev && uv run pytest -q && cd -

# Frontend static checks + simulated tests
cd uis/backoffice/inventory
npm ci
npm run lint && npm run typecheck && npm run build && npm test

# Real end-to-end: disposable PostgreSQL (Docker) + real FastAPI + headless Chrome
npm run e2e:auth
cd -
```

Expected results: pytest **60 passed**; Jest **121 passed, 11 skipped** (the live suite runs inside the E2E gate); E2E **36 passed, 0 failed**, including the line `Jest live API integration suite — Tests: 11 passed`.

`npm run e2e:auth` creates its own database container, random JWT key and temporary TinyDB, and removes them at the end. It does **not** read `services/api/.env`. Evidence is written to `docs/evidence/auth-02/`, so a re-run changes those files. Use `git diff --stat docs/evidence/auth-02` to compare and `git restore docs/evidence/auth-02` to discard.

## 4. Manual run

### 4.1 Environment variables (names only)

The API reads these variables from the environment or from `services/api/.env`. Copy `services/api/.env.example` and fill in your own values. Never commit the real `.env`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL URL for the inventory (required by the inventory routes; see `services/api/README.md`) |
| `JWT_SECRET_KEY` | JWT signing key (use a long random value for local tests) |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime (for example `30`) |
| `SUPPLIER_DB_PATH` | TinyDB file for users, profiles and suppliers (use a temporary path for grading) |
| `API_ALLOWED_ORIGINS` | CORS origins; the default already allows `http://127.0.0.1:5500` |
| `NEXOVA_API_URL` | *(frontend server)* API base used by the browser; default `http://127.0.0.1:8000` |

To keep grading data out of the development database, use a disposable TinyDB file and a key generated in memory:

```sh
cd services/api
export SUPPLIER_DB_PATH="$(mktemp -d /tmp/nexova-auth02.XXXXXX)/tinydb.json"
export JWT_SECRET_KEY="$(uv run python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
# DATABASE_URL: export your own PostgreSQL URL, or keep it in services/api/.env
```

### 4.2 Start the API (terminal 1)

```sh
cd services/api
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
# check: curl -s http://127.0.0.1:8000/health
```

### 4.3 Start the backoffice (terminal 2)

```sh
cd uis/backoffice/inventory
npm ci && npm run build
npm run serve            # http://127.0.0.1:5500  (NEXOVA_API_URL=http://host:port npm run serve to change the API)
```

### 4.4 Serve the public website (terminal 3, optional)

```sh
cd uis/website
python3 -m http.server 8080 --bind 127.0.0.1   # http://127.0.0.1:8080/index.html
```

## 5. Instructor verification procedure (browser)

Open Chrome DevTools → **Application → Local Storage → http://127.0.0.1:5500** so you can watch the key `nexova.auth.token`.

1. **Protected view without a token.** Open `http://127.0.0.1:5500/backoffice/inventory/products`. You are redirected to `/backoffice/login?next=…` and no inventory request is sent (Network tab). Repeat with `/account/profile` and `/backoffice/`.
2. **Registration.** Open `http://127.0.0.1:5500/register` (redirects to `/backoffice/register`). Submit a password shorter than 8 characters to see the field-level error. Then register with a new email, a valid password and optional name/phone/address. Network shows `POST /users` → `POST /auth/login` → `GET /auth/me`. You land on *Activos*, and `nexova.auth.token` appears in Local Storage.
3. **Duplicate registration.** Log out, register again with the same email, and see the email field error ("Este correo ya está registrado…").
4. **Login error.** On `/login`, enter a wrong password. You see "Correo electrónico o contraseña incorrectos.", the URL does not change, no token is stored, and there is no redirect loop.
5. **Login success.** Enter the correct password. The token is stored and you are taken to the requested view (or *Activos*).
6. **Bearer header.** In Network, open any `inventory/*`, `auth/me` or `profiles/me` request. The request headers include `Authorization: Bearer …`.
7. **Reload persistence.** Press ⌘R on a private view. The page shows "Verificando tu sesión…" briefly (one `GET /auth/me`) and stays signed in.
8. **Profile.** Click **Mi perfil** (`/account/profile`). The email, role, name, phone and address come from `GET /auth/me`. Change the fields and click **Guardar cambios**. You see `PUT /profiles/me` with Bearer and "Perfil actualizado correctamente.", and the change survives a reload.
9. **Invalid token.** In DevTools, edit `nexova.auth.token`: replace everything after the second `.` (the signature) with `invalid`, then reload. `GET /auth/me` returns 401, the key is removed, and you land on `/backoffice/login?…&reason=session`.
10. **401 during use.** While signed in, stop the API and start it again with a **different** `JWT_SECRET_KEY` (or replace the token's signature with `invalid` in DevTools without reloading), then click **Mi perfil**. The 401 clears the key and redirects with the "Tu sesión no es válida o ha caducado" notice.
11. **Supplier directory and 403.** Open `http://127.0.0.1:5500/backoffice/`. A newly registered account has role `user`, so the API answers `/suppliers` with **403**. The page shows a permissions message and keeps you signed in, because 403 is not treated as 401. A manager account (see `docs/AUTH-01-TESTING.md` for creating one in a temporary TinyDB) sees the supplier list.
12. **Logout.** Click **Cerrar sesión**. The key disappears, you land on `/backoffice/login?reason=logout`, and opening a private view redirects to login again.
13. **Public website.** With or without a token, open `http://127.0.0.1:8080/index.html` and `application.html`. They load normally, with no redirect, no auth request and no storage use.

## 6. Troubleshooting

- **"No se pudo conectar con la API"**: the API is not running, or `NEXOVA_API_URL` and `API_ALLOWED_ORIGINS` do not match the browser origin.
- **Inventory routes return 500**: `DATABASE_URL` is missing or unreachable. Authentication and profile still work, because they use TinyDB.
- **E2E fails at Docker**: start Docker Desktop. **E2E fails at Chrome**: set `CHROME_PATH=/path/to/Chrome`.
