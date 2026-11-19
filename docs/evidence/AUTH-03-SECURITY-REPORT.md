# AUTH-03 — Security report

Covers the 10 security properties requested for the milestone. File paths are relative to `services/api/` unless stated otherwise. Unless marked otherwise, every property below is enforced by an automated test. Each test was checked by mutation: the protection was removed on purpose to confirm that a test fails (see the test report).

| # | Property | Design | Verified by | Status |
|---|---|---|---|---|
| 1 | Reset tokens expire | `expires_at = created_at + PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` (15–60, default 30; other values stop startup with `RuntimeError`). Checked with `now() >= expires_at` on every use. | Expiry for 15/30/60 min; boundary just before expiry; invalid config; E2E aged token → 400 | PASS |
| 2 | Strict single use | `used_at` is set when the token is consumed. Two more layers apply: all of the user's other open links are revoked, and tokens issued before `password_changed_at` are rejected. | Reuse → 400 (unit, live, E2E); other links revoked by a later reset or change-password | PASS |
| 3 | No account enumeration | Status, body and headers are identical for every well-formed email. Email sending is a background task that runs after the response is sent, so provider latency and errors are invisible. The per-email limit is silent and counts unknown addresses too. The per-IP `429` depends only on the caller's IP, not on any account. | Identical responses (unit); no email for unknown addresses (E2E); delivery failure → generic 200 | PASS |
| 4 | Password hashing | The existing AUTH-01 `hash_password` (bcrypt) and `verify_password` are reused. A single policy constant (`Password`, 8–128) now serves registration, user updates, reset and change. | Stored value starts with `$2`; the plain password is absent from the record; old password 401, new 200 | PASS |
| 5 | Authentication enforcement | `/auth/change-password` uses AUTH-01's `CurrentUser` dependency (JWT signature, expiry, active user). The frontend route is protected by the AUTH-02 guard, and a 401 runs the AUTH-02 session-expiry flow. | 401 without a token or with a bad one (unit, E2E); frontend redirect and 401 tests | PASS |
| 6 | Secrets from the environment | `RESEND_API_KEY`, `JWT_SECRET_KEY` and `EMAIL_FROM` come only from the environment or `services/api/.env`. Names are documented in `.env.example` and the README. `.env` is ignored by `services/api/.gitignore` and the new root `.gitignore`. | Secret scan (below); provider-selection test | PASS |
| 7 | Safe logging | Logs carry the event, outcome and user id only, never the email, token, password or API key. Provider errors keep only the HTTP status and Resend's machine-readable `name`. | `test_logs_never_contain_tokens_passwords_or_emails` (caplog DEBUG); adapter error test checks the key is absent; frontend test checks the token is never logged | PASS |
| 8 | No sensitive token exposure | The raw token exists only in the email link and the user's browser. The database keeps only its SHA-256, so a stolen DB file yields no usable links. API responses never include it. The frontend removes it from the address bar right after reading it and sends it only in the POST body. `serve.cjs` sends `Referrer-Policy: no-referrer`. Evidence screenshots are redacted. | DB file has no raw token (unit, E2E); response body has no token; URL stripped (unit, E2E); evidence scan | PASS |
| 9 | Atomic token consumption and password update | One critical section changes the password hash and `password_changed_at`, then marks the token used. If marking fails, the previous hash is restored before the error is raised, so the database never ends with a new password and a reusable token. | `test_password_update_and_token_consumption_are_atomic` (injected storage failure → old password still valid, new one not) | PASS |
| 10 | No concurrent reuse | A process lock (`_PASSWORD_LOCK`) serialises check-and-consume for reset and change. | `test_concurrent_reuse_of_one_token_succeeds_exactly_once`: 8 threads, slowed hashing → exactly 1 success, 7 rejections | PASS |

## Residual risks and scope limits

- **Single process.** TinyDB is a JSON file owned by one API process, so the in-process lock is enough here. Running several API workers or hosts would need a database-level lock or a transactional store for properties 9 and 10.
- **Timing.** A registered address costs one extra small TinyDB write before the response. Provider latency, the dominant factor, is outside the request. Fully constant-time handling would need a dummy write for unknown addresses; it was not done because the remaining difference is small next to normal network jitter.
- **Existing sessions are not revoked.** A password reset or change does not invalidate JWTs that were already issued; AUTH-01's tokens are stateless. They expire after `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`. Rejecting tokens issued before `password_changed_at` in `get_current_user` is a possible follow-up, but it would change AUTH-01 behaviour, so it is left out of this milestone. The reset page does clear the session in the current browser.
- **IP behind a proxy.** The client IP is the direct peer address, and `X-Forwarded-For` is ignored on purpose. Behind a reverse proxy, every request would share one IP for the per-IP limit until trusted-proxy handling is configured.
- **localStorage.** The AUTH-02 XSS note still applies to the session JWT. Reset tokens are never stored client-side.

## Secret scan (2026-11-19)

Run over all tracked and new files with `git add -N .` and `git grep`:

| Pattern | Result |
|---|---|
| Resend-style keys `re_[A-Za-z0-9]{20,}` | none (the only `re_` values are the test dummies `re_dummy_key_for_tests` and `re_invalid_probe…`, plus the random per-run E2E key that is never written to disk) |
| `RESEND_API_KEY / JWT_SECRET_KEY / SENDGRID_API_KEY = <value>` | only the documented placeholder in `docs/evidence/auth-01.md` and code that *reads* the variable |
| JWTs `eyJ…` | none |
| Tracked `.env` files | none (`services/api/.env.example` only) |
| `token=` values in `docs/evidence/auth-03/*.json, *.txt` | none; the email screenshot shows `TOKEN-REDACTADO-EN-EVIDENCIA` |

## Resend key lifecycle (2026-11-19)

| Step | Control |
|---|---|
| Creation | The account owner created the key in the Resend dashboard (login and MFA are theirs). No automation was used to sign in. |
| Storage | `scripts/configure_resend.py set-key` reads the key at a hidden prompt, validates it with Resend, writes only the `RESEND_API_KEY` line of `services/api/.env` (mode 600) and refuses to overwrite an existing key without `--replace`. The E2E recipient is stored the same way (`set-recipient`). `services/api/.env` is git-ignored, and `git status` never listed it. |
| Use | The harness reads the key and recipient from `.env` (`E2E_REAL_RESEND=1`), so neither appears in a command line or shell history. Results record Resend message ids and timestamps only. A scan after the run found no recipient address, key or token in any committed result file. No screenshots are taken in real mode. |
| Least privilege | After verification, `rotate-to-sending` created the sending-only key `nexova-api-sending`, stored it in `.env` and deleted the full-access key `nexova-auth03-e2e-full-access` from the account (Resend confirmed the deletion). Current status: `permission: sending_access`. A test send with it was accepted (`01a1f213-10af-716f-be22-c8a8f9f8a556`). |
| Errors | The opt-in test `tests/test_resend_live.py` (`RESEND_LIVE_TESTS=1`) calls `api.resend.com` with a deliberately invalid key. It checks for a typed `EmailDeliveryError` and that the key is absent from `str`, `repr` and captured logs. It passed standalone and inside the real E2E run. |

## Real-provider probe

The real adapter was pointed at `https://api.resend.com` with a deliberately invalid key and Resend's documented test recipient `delivered@resend.dev`. Resend answered `status=401 reason=validation_error`, and the raised error did not contain the key. This proves that the request reaches Resend, passes Resend's User-Agent check (error 1010 otherwise) and that provider errors are handled. On its own this does not prove delivery; the real E2E run does (see the checklist: 2 emails with `last_event: delivered`).
