# AUTH-01 instructor testing guide

This guide reproduces the automated AUTH-01 checks and, optionally, the interactive Swagger flow from a clean clone. It uses temporary test data and a disposable JWT signing key; do not use customer or development data.

## Prerequisites

- Python 3.11 or later
- [`uv`](https://docs.astral.sh/uv/)
- A shell and a browser for the optional Swagger check

## Run the full automated suite

From the repository root:

```sh
cd services/api
uv sync --extra dev
uv run pytest -q
```

`tests/test_auth.py` uses pytest's `tmp_path` fixture for TinyDB isolation, sets a test-only JWT secret via `monkeypatch`, and overrides the user, profile, and supplier table dependencies. Tests do not read or write the default application data file. The manager-role tests register through the API, then update the user's role using the isolated TinyDB dependency override; they do not expose a role-assignment endpoint to public registration.

Expected result: **26 passed** (the exact count can increase if later tests are added). A Starlette/httpx TestClient deprecation warning may be emitted by the current dependency set; it is non-failing.

## Reproduce the manager supplier authorization test

The integration test `test_existing_sensitive_supplier_routes_require_manager_or_admin` in `services/api/tests/test_auth.py` is the canonical example. It:

1. Registers a user via `POST /users`.
2. Confirms anonymous supplier operations return 401 and a normal user's supplier-list request returns 403.
3. Uses the fixture's overridden `get_users_table` TinyDB table to set that test user to `manager`.
4. Logs in via the application endpoint to obtain a JWT.
5. Verifies create/list/detail/rate/status/delete supplier operations with that token.

`test_supplier_list_rejects_invalid_tokens_and_accepts_manager_token` additionally confirms `GET /suppliers` returns 401 without a token, with a malformed token, and with an expired signed token, then returns 200 with a valid manager JWT.

## Optional manual Swagger check with a temporary manager account

This flow creates a temporary TinyDB file outside the repository and a one-off manager record using the application's password hashing function. It does not use the normal development database. The shell prompts for the test password without echoing it; the test JWT key is generated in-memory and is not saved to disk. Run this from the repository root in Bash (macOS Terminal's `bash` works):

```sh
cd services/api
AUTH_QA_DIR="$(mktemp -d /tmp/nexova-auth01-swagger.XXXXXX)"
export SUPPLIER_DB_PATH="$AUTH_QA_DIR/tinydb.json"
export JWT_SECRET_KEY="$(uv run python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
export AUTH_QA_EMAIL="auth-qa-manager@example.com"
read -r -s -p 'Temporary QA manager password: ' AUTH_QA_PASSWORD; echo
export AUTH_QA_PASSWORD
uv run python - <<'PY'
import os
from datetime import datetime, timezone
from getpass import getpass
from tinydb import TinyDB
from app.auth import hash_password

password = os.environ.get("AUTH_QA_PASSWORD") or getpass("Temporary QA manager password: ")
email = os.environ["AUTH_QA_EMAIL"].strip().casefold()
database = TinyDB(os.environ["SUPPLIER_DB_PATH"])
users = database.table("users")
profiles = database.table("profiles")
if users.search(lambda row: row.get("email") == email):
    raise SystemExit("The temporary database already contains this email; choose a new temporary path or email.")
user_id = users.insert({
    "email": email,
    "hashed_password": hash_password(password),
    "is_active": True,
    "role": "manager",
    "created_at": datetime.now(timezone.utc).isoformat(),
})
users.update({"id": user_id}, doc_ids=[user_id])
profile_id = profiles.insert({"user_id": user_id, "name": "AUTH-01 QA Manager", "phone": None, "address": None})
profiles.update({"id": profile_id}, doc_ids=[profile_id])
print(f"Created temporary manager {email!r} in {os.environ['SUPPLIER_DB_PATH']}")
database.close()
PY
unset AUTH_QA_PASSWORD
uv run uvicorn app.main:app --host 127.0.0.1 --port 8766
```

The generated JWT key exists only in the current shell environment. Keep that shell alive while Uvicorn runs. Do not paste the password or secret into source files, terminal transcripts, issue comments, or screenshots. The dedicated temporary directory prevents any collision with application data. If your platform does not support the `mktemp -d` template, create a new private directory under `/tmp` manually.

Open **http://127.0.0.1:8766/docs**. In Swagger:

1. Click **Authorize**.
2. Enter the `AUTH_QA_EMAIL` value as username and the password entered at the prompt as password. Leave client ID/secret blank.
3. Click **Authorize**, then **Close**.
4. Expand **GET /suppliers**, click **Try it out**, then **Execute**.
5. Expect HTTP **200** and body `[]` in the fresh database. Click **Authorize** again and log out (or open a private browser window) before testing no-credential access; expect HTTP **401** without a bearer token.

Stop the server with Ctrl+C. Remove the temporary TinyDB file when finished:

```sh
rm -rf "$AUTH_QA_DIR"
unset AUTH_QA_DIR SUPPLIER_DB_PATH JWT_SECRET_KEY JWT_ACCESS_TOKEN_EXPIRE_MINUTES AUTH_QA_EMAIL
```

The manual browser results documented for AUTH-01 were verified by the milestone owner. Automated malformed/expired token cases are independently covered by the TestClient regression tests described above.

## Evidence

See [the AUTH-01 evidence checklist](./evidence/auth-01.md) for the 28-item acceptance matrix, protected route inventory, test results, and recorded Swagger observations.
