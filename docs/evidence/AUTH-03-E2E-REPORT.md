# AUTH-03 — End-to-end report and reproduction

## What was run

`npm run e2e:password` (from `uis/backoffice/inventory/`) on 2026-11-19 runs the following:

- A disposable PostgreSQL 16 container (TLS), the **real FastAPI app** with a temporary TinyDB, a random `JWT_SECRET_KEY` and `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=15`, the backoffice static server and headless Chrome over CDP.
- **Email provider: SIMULATED.** A local server that speaks Resend's `POST /emails` contract. The API uses its **real** `ResendEmailSender` (stdlib HTTP, Bearer, User-Agent) pointed at it through `RESEND_API_BASE_URL`. Only Resend's own servers are replaced.
- Result: **56 passed, 0 failed** ([`auth-03/e2e-results.json`](./auth-03/e2e-results.json); `"emailProvider": "simulated (local Resend-compatible server)"`).

## The 10 required demonstrations

| # | Step | How it was shown | Status |
|---|---|---|---|
| 1 | A registered test user requests recovery | Throwaway user created via `POST /users`. On `/login`, Chrome clicks "¿Olvidaste tu contraseña?", submits the form (twice, to test the guard) and sees the generic confirmation with the form disabled (`12-forgot-confirmation.png`). | PASS |
| 2 | The **actual** email provider accepts and sends the message | Real adapter → simulated provider: one request with the correct shape, message id returned. Real Resend: reachable, invalid key rejected with 401. **No real send (no key).** | **BLOCKED** (simulated: PASS) |
| 3 | The reset link reaches the correct frontend page | Link from the captured email = `<frontend>/backoffice/reset-password?token=…`; Chrome opens it, the form appears and the token is removed from the address bar. The email is also rendered on a 390 px viewport (`13-reset-email-mobile.png`, token redacted). | PASS |
| 4 | The user submits a new password | Mismatch is blocked first, then a matching pair is submitted. | PASS |
| 5 | The reset succeeds | Redirected to `/backoffice/login?reason=password-reset` with the success message (`14-login-after-reset.png`). | PASS |
| 6 | The old password fails | `POST /auth/login` with the old password → 401. | PASS |
| 7 | The new password works | `POST /auth/login` with the new password → 200; later used to sign in through the UI. | PASS |
| 8 | Reusing the same token fails | API → 400. In the browser, the same link → "no es válido, ya se usó o ha caducado" + "Solicitar un nuevo enlace" (`15-reset-link-invalid.png`). | PASS |
| 9 | The authenticated user can change their password | `/account/change-password` redirects to login without a session. After login, the change succeeds (`17-change-password-success.png`); previous password 401, new password 200. | PASS |
| 10 | A wrong current password is rejected | Browser: real HTTP 400 → "La contraseña actual no es correcta." on the field, session kept (`16-change-password-wrong-current.png`). API: 400; without a token: 401. | PASS |

Additional E2E checks: an unknown email gets an identical 200 and no email is sent; expiry (15 min window configured, aged token → 400, password unchanged); EXTRA-02 (5 requests → 5 × 200 and only 3 emails); EXTRA-03 (8 audit event kinds with IP and user agent); no raw token or password anywhere in the database file and no email address in the audit trail; no uncaught JS errors; the only failed network requests are the expected 400s, 401s, 403s and 409s.

**Expiry in E2E:** waiting 15 real minutes is impractical, so the harness moves the stored `expires_at` of a fresh token into the past in the throwaway TinyDB file. The same technique is used for roles and deactivation in AUTH-02. Exact boundary behaviour (just before and just after the window) is covered by the backend tests with a controlled clock.

## Real Resend run (needed to close EVAL-01)

### Provider requirements (checked against Resend's documentation, 2026-11-19)

- Endpoint `POST https://api.resend.com/emails`, `Authorization: Bearer <key>`, JSON `from/to/subject/html/text`, and a **User-Agent header is required** (otherwise Cloudflare error 1010).
- Without a verified domain, the sender `onboarding@resend.dev` **only delivers to the email address of the Resend account itself**; other recipients get HTTP 403. Using another recipient requires verifying a domain and setting `EMAIL_FROM` to it.
- Reading a sent email back (`GET /emails/{id}`) needs a **full-access** key. The harness uses this to follow the link in the email Resend actually sent.

### Steps (macOS)

```sh
# 1. Store the key only in the git-ignored API env file (do not paste it in commands or chat).
cd services/api
cp -n .env.example .env        # if you do not have one yet; then edit it:
#    RESEND_API_KEY=<your full-access key>
#    EMAIL_FROM=Nexova <onboarding@resend.dev>
cd ../../uis/backoffice/inventory
npm ci && npm run build
# 2. Real-provider E2E: the recipient must be your Resend account's email.
E2E_RESEND_TO='<your-resend-account-email>' npm run e2e:password
```

Expected output: `AUTH-03 Email: reset email accepted by the provider [REAL Resend] — message id <id>, last_event=<sent|delivered>`, and every other check PASS. The run sends 3 real emails (the request, the "known vs unknown" comparison, the expiry check) and skips the rate-limit check so it doesn't send more. Results go to `docs/evidence/auth-03/e2e-results-real-resend.json`. No screenshots are taken in this mode, because your real address would appear on screen (`E2E_REAL_SCREENSHOTS=1` overrides this). Finally, confirm in your inbox that the email arrived and the button opens `/backoffice/reset-password`.

## Manual reproduction for the professor (no Resend key needed)

```sh
# Terminal 1 — API with a disposable TinyDB, test JWT secret and the local fake provider
cd services/api && uv sync --extra dev
export SUPPLIER_DB_PATH="$(mktemp -d /tmp/nexova-auth03.XXXXXX)/tinydb.json"
export JWT_SECRET_KEY="$(uv run python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export FRONTEND_BASE_URL=http://127.0.0.1:5500
# Optional real email: export RESEND_API_KEY in .env as described above.
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — backoffice
cd uis/backoffice/inventory && npm ci && npm run build && npm run serve
```

1. Register at `http://127.0.0.1:5500/register`, then log out.
2. On `/login`, click **¿Olvidaste tu contraseña?** and submit your email. The generic confirmation appears and the form stays disabled. Try an unknown email too: the message is the same.
3. Without `RESEND_API_KEY` no email is sent, and the audit table records `reset_email: delivery_failed (not_configured)`. To try the full browser flow without Resend, run the automated `npm run e2e:password`, which captures the email locally. With a key, open the email and click **Restablecer contraseña**.
4. On `/reset-password`, enter different passwords to see the mismatch error, then matching ones. You land on `/login` with "Tu contraseña se ha restablecido". The old password now fails and the new one works.
5. Open the same link again: "El enlace … no es válido, ya se usó o ha caducado" + **Solicitar un nuevo enlace**.
6. Sign in, go to **Mi perfil → Cambiar contraseña** (`/account/change-password`). A wrong current password → field error; mismatched confirmation → error before any request; correct values → success message.

API-only checks:

```sh
curl -s -X POST localhost:8000/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"nobody@example.com"}'   # 200, generic
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8000/auth/reset-password -H 'Content-Type: application/json' -d '{"token":"bogus","new_password":"whatever-123"}'   # 400
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8000/auth/change-password -H 'Content-Type: application/json' -d '{"current_password":"x","new_password":"whatever-123"}'   # 401
```

Automated suites: `cd services/api && uv run pytest -q` (92 passed), then `cd uis/backoffice/inventory && npm run lint && npm run typecheck && npm test` (142 passed, 14 skipped) and `npm run e2e:password` (56 passed). The E2E run needs Docker and Chrome.
