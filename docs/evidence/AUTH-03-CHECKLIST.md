# AUTH-03 — Checklist (La Pieza Que Faltaba: Flujo de Restablecimiento de Contraseña)

- **Branch:** `feature/password-reset`
- **Base:** `feature/auth-frontend` (PR #11), the top of the open PR stack. See *Dependency* below.
- **Official source:** [`sources/auth-03-README.es.md`](./sources/auth-03-README.es.md), syllabus commit `784ef4a9c280e3000bbe79f53c6a15dbe1a43372`.
- **Results:** recorded 2026-11-19 against the commit that contains this file. Commands and counts are in [`AUTH-03-TEST-REPORT.md`](./AUTH-03-TEST-REPORT.md); browser and API runs are in [`AUTH-03-E2E-REPORT.md`](./AUTH-03-E2E-REPORT.md).

## Summary

| Block | Result |
|---|---|
| "Qué Debes Hacer" — Backend (DO-B1…B5) | 4 PASS, **1 BLOCKED** (DO-B4: real email sending) |
| "Qué Debes Hacer" — Frontend (DO-F1…F4) | 4/4 PASS |
| "Qué Debes Hacer" — Seguridad (DO-S1…S3) | 3/3 PASS |
| "Qué Vamos a Evaluar" (EVAL-01…12) | 11 PASS, **1 BLOCKED** (EVAL-01: real email) |
| **Official total** | **22/24 PASS, 2 BLOCKED, 0 FAIL** |
| Optional extensions (EXTRA-01…03) | 3/3 PASS |

**The only blocker is external: no Resend API key exists in this environment.** Everything else in the email path is implemented and verified: the real adapter was exercised against a Resend-compatible server in the E2E run, and against the real `api.resend.com`, which answered `401 validation_error` to a deliberately invalid key. Delivery to a real inbox has not been observed, so DO-B4 and EVAL-01 are reported as BLOCKED, not PASS. To close them, run the command in *Unblocking* below.

## Labels

- **Unit (backend):** pytest with an isolated TinyDB and an in-memory email outbox (`services/api/tests/test_password_reset.py`).
- **Unit (frontend):** Jest + jsdom with the real `NexovaAuth` module, real views and a SIMULATED backend (`tests/password.test.ts`).
- **Live:** real FastAPI, with the real Resend adapter talking to a local Resend-compatible capture server (`tests/live.integration.test.ts`, AUTH-03 block).
- **E2E:** `npm run e2e:password`. Headless Chrome, real FastAPI, disposable PostgreSQL and TinyDB, and the real Resend adapter talking to a **simulated provider** (local Resend-compatible server). Results: [`auth-03/e2e-results.json`](./auth-03/e2e-results.json).

## "Qué Debes Hacer" (12)

### Backend

| ID | Official item | Implementation | Verification | Status |
|---|---|---|---|---|
| DO-B1 | `POST /auth/forgot-password` accepts `{email}`. If the user exists, it creates a token that expires in 15–60 min and emails the link. It always returns `200`. | `app/routes/password.py` `forgot_password`; `app/password_reset.py` `issue_reset_token` (256-bit `secrets.token_urlsafe(32)`, SHA-256 stored, `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` limited to 15–60) | Unit: link and hash only, unknown email gives an identical response, inactive account, provider failure is still generic, 15/30/60 windows, out-of-range config rejected. E2E: UI request → email captured → link works; unknown email → identical 200 and no email | PASS |
| DO-B2 | `POST /auth/reset-password` accepts `{token, new_password}` and validates signature, expiry and prior use. It hashes, updates and invalidates the token. It returns `400` for invalid, expired or used tokens. | `password_reset.reset_password` under a process lock: lookup by hash, `used_at`, `expires_at`, `password_changed_at` → bcrypt `hash_password` → token consumed, other links revoked, compensation on failure | Unit: success swaps credentials; reuse → 400; expiry → 400; forged → 400; weak password → 422 without consuming; 8 concurrent attempts → exactly 1 success; atomic rollback. Live and E2E: old password 401, new password 200, reuse 400, expired 400 | PASS |
| DO-B3 | `POST /auth/change-password` accepts `{current_password, new_password}`, needs a valid `Authorization`, verifies the current password and returns `400` if it is wrong. | `routes/password.change_password` (`CurrentUser` dependency from AUTH-01); `password_reset.change_password` | Unit: 401 without or with an invalid token, 400 wrong current, success swaps credentials and revokes reset links, 422 policy, 400 identical password. E2E: 401 and 400 via API; browser success | PASS |
| DO-B4 | Integrate a transactional email service; the email contains the link and reads well on mobile. | `app/mailer.py` `ResendEmailSender` (REST `POST /emails`, Bearer, User-Agent, timeout, typed errors) behind the `EmailSender` interface; `app/email_templates.py` (responsive HTML + text) | Unit: exact Resend request shape; 403 error mapped without leaking the key; unreachable → status 0. E2E: Resend-compatible server receives the request; email renders on a 390 px viewport. **Real Resend:** the endpoint is reachable and rejects an invalid key (401). **Delivery with a valid key has not been observed.** | **BLOCKED** (needs `RESEND_API_KEY`) |
| DO-B5 | The API key is stored in an environment variable, documented in the README or `.env.example`. | `RESEND_API_KEY` read in `mailer.get_email_sender()`. Documented in `services/api/.env.example` and `services/api/README.md`. `.env` is ignored by `services/api/.gitignore` and the new root `.gitignore` | Unit `test_provider_selection_from_environment`; secret scan (security report) | PASS |

### Frontend

| ID | Official item | Implementation | Verification | Status |
|---|---|---|---|---|
| DO-F1 | `/forgot-password` calls the API, shows the confirmation and disables the form after submission. | `inventory/src/views/forgot-password.ts`. Route `/backoffice/forgot-password`; `/forgot-password` → 302 | Unit (6). E2E: the confirmation matches the official wording, input and button stay disabled, and a double submit sends one email | PASS |
| DO-F2 | `/reset-password` reads `token` from the URL and has a confirmation field. Success → `/login` with a message. Failure → clear error and a link to `/forgot-password`. | `inventory/src/views/reset-password.ts` (the token is removed from the address bar after it is read) | Unit (7). E2E: emailed link → form → mismatch blocked → success → `/backoffice/login?reason=password-reset`; reused link → error + link | PASS |
| DO-F3 | `/account/change-password` validates that the new password and its confirmation match before calling the API. | `inventory/src/views/change-password.ts`, protected route in `src/app.ts`, `accountApi.changePassword` over the shared Bearer client | Unit (5). E2E: requires a session; real 400 shown on the current-password field; success | PASS |
| DO-F4 | A "¿Olvidaste tu contraseña?" link on `/login` points to `/forgot-password`. | `inventory/src/views/login.ts` `#forgot-password-link` | Unit (text, href, visible, navigates). E2E: visible link with non-zero size → opens the form | PASS |

### Security

| ID | Official item | Evidence | Status |
|---|---|---|---|
| DO-S1 | Tokens expire and are invalidated after use; a token cannot be used twice. | Expiry and single-use tests (unit, live, E2E); the concurrency test proves exactly one success out of 8 parallel attempts | PASS |
| DO-S2 | `/forgot-password` always returns `200` and never reveals whether an email is registered. | Identical status, body and headers (unit); identical response and no email for unknown addresses (E2E); per-email throttling is silent; delivery is a background task, so delivery time does not change the response time. See [`AUTH-03-SECURITY-REPORT.md`](./AUTH-03-SECURITY-REPORT.md) for the per-IP `429` | PASS |
| DO-S3 | API keys never appear in source code; only environment variables are used. | Secret scan of all tracked and new files: no Resend-style keys, JWTs or `.env` files. Tests use obvious dummies (`re_dummy_key_for_tests`). The E2E simulated key is random per run and never written | PASS |

## "Qué Vamos a Evaluar" (12)

| ID | Official criterion | Evidence | Status |
|---|---|---|---|
| EVAL-01 | `POST /auth/forgot-password` sends a **real** email with the reset link to a registered address. | Verified up to the provider: the request reaches `api.resend.com` (invalid-key probe → 401), and the full flow works with a Resend-compatible server. No valid key is available, so no real email has been observed. | **BLOCKED** |
| EVAL-02 | It returns `200` for unregistered addresses without leaking information. | DO-S2 | PASS |
| EVAL-03 | The token expires after the configured window and cannot be used afterwards. | Unit: windows of 15/30/60 min are checked at the boundary; a token 1 s past expiry → 400 and the password is unchanged; 10 s before expiry → OK. E2E: a 15 min window is configured, and an aged token → 400 | PASS |
| EVAL-04 | `POST /auth/reset-password` updates the password and invalidates the token on success. | DO-B2 (`used_at` set, other links revoked, credentials swapped) | PASS |
| EVAL-05 | It returns `400` for expired or already-used tokens. | Unit, live and E2E (`{"detail":"Invalid or expired reset token"}`) | PASS |
| EVAL-06 | `/forgot-password` shows a confirmation whatever the result. | Unit: registered and unregistered addresses get the same text. E2E screenshot `auth-03/12-forgot-confirmation.png` | PASS |
| EVAL-07 | `/reset-password` reads the token from the URL, submits and redirects to `/login` on success. | E2E following the emailed link; `auth-03/14-login-after-reset.png` | PASS |
| EVAL-08 | `/reset-password` shows a clear error with a link back to `/forgot-password` when the token is invalid or expired. | Unit: expired, used, forged and missing tokens. E2E reused link; `auth-03/15-reset-link-invalid.png` | PASS |
| EVAL-09 | `/login` has a visible "¿Olvidaste tu contraseña?" link. | DO-F4 | PASS |
| EVAL-10 | `/account/change-password` validates the confirmation, calls the API and shows success or error feedback. | DO-F3; `auth-03/16-change-password-wrong-current.png`, `17-change-password-success.png` | PASS |
| EVAL-11 | `POST /auth/change-password` rejects a wrong current password with `400`. | Unit, live and E2E (API and browser) | PASS |
| EVAL-12 | No API key in source code; all secrets come from environment variables. | DO-S3 | PASS |

## Optional extensions

| ID | Extension | Implementation | Verification | Status |
|---|---|---|---|---|
| EXTRA-01 | HTML email template | `app/email_templates.py`: table layout, `max-width:560px`, viewport meta, large button, escaped link with copy-paste fallback, plain-text part, expiry and "ignore if not you" notes | Unit (escaping, viewport, text part). E2E renders the email the API actually sent on a 390 px phone viewport (no horizontal overflow; `auth-03/13-reset-email-mobile.png`, token redacted) | PASS |
| EXTRA-02 | Rate limiting per email per hour | `password_reset.email_rate_limited` (default 3/h, silent `200`, unknown addresses counted the same way) and `ip_rate_limited` (default 20/h → `429` + `Retry-After`), sliding one-hour window from the audit table, configurable | Unit (silent per-email limit for known and unknown addresses; window reset after 1 h; IP 429). E2E: 5 requests → all 200, exactly 3 emails | PASS |
| EXTRA-03 | Audit log of reset events (timestamp, IP) in the database | TinyDB `password_audit_events`: `event`, `outcome`, `at` (UTC), `ip`, `user_agent`, `user_id` or keyed `email_hmac`, provider status or message id | Unit (event sequence; no token, hash, password or email in the dump). E2E: 8 event/outcome kinds with IP and user agent; no secrets in the database file | PASS |

## Platform notes (same as AUTH-02)

- The frontends are the existing HTML/TypeScript apps, not Next.js. Canonical routes use the `/backoffice/` prefix, and `/forgot-password`, `/reset-password` and `/account/change-password` redirect there with a 302 (query string kept, so emailed tokens survive).
- Users already live in TinyDB, so reset tokens, rate-limit counters and audit events are TinyDB tables in the same file. No new database or dependency was added (Resend is called with the standard library).

## Unblocking DO-B4 / EVAL-01

1. Create a Resend account and a **full-access** API key. The harness reads the sent email back with `GET /emails/{id}`, which a sending-only key cannot do.
2. Put `RESEND_API_KEY=<key>` in `services/api/.env` (git-ignored). Do not paste it into commands or chat.
3. Run `cd uis/backoffice/inventory && E2E_RESEND_TO=<the Resend account's own email> npm run e2e:password`. With the `onboarding@resend.dev` sender, Resend only delivers to that address.
4. The run writes `docs/evidence/auth-03/e2e-results-real-resend.json`, recording Resend's message id and `last_event`. It takes no screenshots in this mode, because your real address would appear on screen. Check that the email arrived in the inbox.

## Dependency

`main` still lacks every earlier milestone (open PRs #4 → #5 → #9 → #10 → #11). This branch is stacked on #11, so the PR against `main` also shows those commits until they are merged in order. Review only AUTH-03 with `git diff feature/auth-frontend...feature/password-reset`.
