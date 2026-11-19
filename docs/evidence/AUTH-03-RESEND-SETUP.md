# AUTH-03 — Resend setup (real email delivery)

This guide uses placeholders only. **Never** put a real key, password or reset token in this file, a commit, a terminal command, a screenshot or a chat message.

## What Resend requires (docs, checked 2026-11-19)

- Sending: `POST https://api.resend.com/emails` with `Authorization: Bearer <RESEND_API_KEY>` and a `User-Agent` header. Requests without a User-Agent are blocked with Cloudflare error 1010.
- Without a verified domain, the sender `onboarding@resend.dev` **only delivers to the email address of your own Resend account**. Any other recipient gets HTTP 403. To email other people, verify a domain and set `EMAIL_FROM` to an address on it.
- Key permissions: `full_access` can manage everything, including reading sent emails back with `GET /emails/{id}`. `sending_access` can only send.
  - The real E2E run needs **full access**, so it can read the delivered email and follow its real link.
  - Normal operation needs only **sending access**.

## 1. Create the key (manual: requires your Resend login)

1. Sign in, or sign up, at <https://resend.com> and complete any email verification or MFA yourself.
2. Go to **API Keys → Create API Key**.
   - Name: `nexova-auth03-e2e-full-access` (the rotation step looks the key up by this exact name).
   - Permission: **Full access**.
3. Copy the key once; Resend shows it only once. Do not paste it anywhere except the prompt in step 2.

## 2. Store it (hidden prompt, nothing echoed)

```sh
cd services/api
uv run python scripts/configure_resend.py set-key        # paste at the hidden prompt
uv run python scripts/configure_resend.py status         # → "set (permission: full_access)"
```

The helper:
- validates the key against Resend;
- writes only the `RESEND_API_KEY` line of `services/api/.env`, preserving every other line;
- sets the file to mode 600;
- refuses to overwrite an existing key unless `--replace` is passed.

`services/api/.env` is git-ignored by `services/api/.gitignore` and the root `.gitignore`. Check it with `git check-ignore -v services/api/.env`.

Optional variables (see `services/api/.env.example`): `EMAIL_FROM` (default `Nexova <onboarding@resend.dev>`), `FRONTEND_BASE_URL`, `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` (15–60), `PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR`, `PASSWORD_RESET_MAX_PER_IP_PER_HOUR`.

## 3. Run the real end-to-end test

```sh
cd uis/backoffice/inventory
E2E_RESEND_TO='<your-resend-account-email>' npm run e2e:password
```

- The key is read from `services/api/.env`. `E2E_RESEND_TO` must be your Resend account's own address while you use the `onboarding@resend.dev` sender.
- The run first checks that the key is valid and has full access. It then runs the live provider-error test and the full AUTH-03 browser flow, which **sends 3 real emails**.
- It reads each email back from Resend and requires `last_event = delivered` before following the real link.
- Results go to `docs/evidence/auth-03/e2e-results-real-resend.json`: Resend message ids, `last_event`, timestamps and per-check results. The file contains no recipient address, token or key.
- No screenshots are taken in this mode, because your address would be visible.
- Finally, confirm the emails in your inbox (and spam folder).

## 4. Rotate to a sending-only key (after verification)

```sh
cd services/api
uv run python scripts/configure_resend.py rotate-to-sending --delete-name nexova-auth03-e2e-full-access
uv run python scripts/configure_resend.py status         # → "set (permission: sending_access)"
```

Using the full-access key, this creates the sending-access key `nexova-api-sending`, stores it in `.env` and then deletes `nexova-auth03-e2e-full-access` from your account. If the delete fails, the helper says so; revoke the key manually under **API Keys**.

A later real E2E run needs a full-access key again (step 1). Normal API use (`POST /auth/forgot-password`) works with the sending key.

## Troubleshooting

| Symptom | Meaning |
|---|---|
| `preflight … HTTP 401` | Key invalid or revoked, or it is a sending-only key (the E2E run needs full access) |
| audit `reset_email: delivery_failed`, `provider_status=403` | Recipient is not your Resend account address while using `onboarding@resend.dev` |
| `provider_reason=not_configured` | `RESEND_API_KEY` is not set in the API's environment |
| `last_event=bounced/suppressed` | The provider could not deliver; check the address and the Resend dashboard |
