"""Configure the Resend API key for AUTH-03 without ever printing it.

Usage (from services/api):
  uv run python scripts/configure_resend.py set-key [--replace]   # hidden prompt → .env (chmod 600)
  uv run python scripts/configure_resend.py status                # is a key set? which permission?
  uv run python scripts/configure_resend.py rotate-to-sending --delete-name NAME
        # with the current FULL-ACCESS key: create a sending-access key, store it in .env,
        # then delete the full-access key called NAME from the Resend account.

Only the RESEND_API_KEY line of services/api/.env is touched; every other line is preserved.
The key is never echoed, logged or passed on the command line.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
API = "https://api.resend.com"
KEY_LINE = re.compile(r"^\s*RESEND_API_KEY\s*=(.*)$")
SENDING_KEY_NAME = "nexova-api-sending"


# ------------------------------------------------------------------------------------- .env editing
def read_key(text: str) -> str:
    for line in text.splitlines():
        match = KEY_LINE.match(line)
        if match:
            return match.group(1).strip().strip("'\"")
    return ""


def with_key(text: str, key: str, *, replace: bool) -> str:
    """Return `text` with RESEND_API_KEY set to `key`. Refuses to overwrite a non-empty key unless `replace`."""
    if read_key(text) and not replace:
        raise SystemExit("RESEND_API_KEY is already set in .env; re-run with --replace to overwrite it.")
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if KEY_LINE.match(line):
            lines[index] = f"RESEND_API_KEY={key}"
            break
    else:
        if lines and lines[-1].strip():
            lines.append("")
        lines.append("# AUTH-03 Resend key (written by scripts/configure_resend.py; never commit this file)")
        lines.append(f"RESEND_API_KEY={key}")
    return "\n".join(lines) + "\n"


def write_env(text: str) -> None:
    ENV_PATH.write_text(text)
    os.chmod(ENV_PATH, 0o600)


# ------------------------------------------------------------------------------------------ Resend
def call(method: str, path: str, key: str, body: dict | None = None) -> tuple[int, dict]:
    request = urllib.request.Request(f"{API}{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                              "User-Agent": "nexova-api-setup/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read() or b"{}")
        except ValueError:
            payload = {}
        return error.code, payload if isinstance(payload, dict) else {}
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}


def permission(key: str) -> str:
    """'full_access', 'sending_access', 'invalid' or 'unreachable' (GET /api-keys needs full access)."""
    status, payload = call("GET", "/api-keys", key)
    if status == 200:
        return "full_access"
    if status == 0:
        return "unreachable"
    return "sending_access" if payload.get("name") == "restricted_api_key" else "invalid"


# --------------------------------------------------------------------------------------- commands
def cmd_set_key(args: argparse.Namespace) -> int:
    text = ENV_PATH.read_text() if ENV_PATH.exists() else ""
    if read_key(text) and not args.replace:
        print("RESEND_API_KEY is already set in services/api/.env (not changed). Use --replace to overwrite.")
        return 1
    key = getpass.getpass("Paste the Resend API key (input hidden): ").strip()
    if not re.fullmatch(r"re_[A-Za-z0-9_]{10,}", key):
        print("That does not look like a Resend API key (expected re_…). Nothing was written.")
        return 1
    level = permission(key)
    if level in {"invalid", "unreachable"}:
        print(f"Resend did not accept the key ({level}). Nothing was written.")
        return 1
    write_env(with_key(text, key, replace=args.replace))
    print(f"Saved RESEND_API_KEY to services/api/.env (permission: {level}; file mode 600).")
    if level != "full_access":
        print("Note: the real E2E run needs a FULL-ACCESS key to read the sent email back.")
    return 0


def cmd_status(_args: argparse.Namespace) -> int:
    key = read_key(ENV_PATH.read_text()) if ENV_PATH.exists() else ""
    if not key:
        print("RESEND_API_KEY: not set")
        return 1
    print(f"RESEND_API_KEY: set (permission: {permission(key)})")
    return 0


def cmd_rotate(args: argparse.Namespace) -> int:
    text = ENV_PATH.read_text() if ENV_PATH.exists() else ""
    old = read_key(text)
    if not old or permission(old) != "full_access":
        print("The current key is missing or not full-access; rotation needs the full-access key in .env.")
        return 1
    status, keys = call("GET", "/api-keys", old)
    matches = [k for k in keys.get("data", []) if k.get("name") == args.delete_name]
    if status != 200 or len(matches) != 1:
        print(f"Expected exactly one API key named {args.delete_name!r}; found {len(matches)}. Nothing changed.")
        return 1
    status, created = call("POST", "/api-keys", old, {"name": SENDING_KEY_NAME, "permission": "sending_access"})
    new = created.get("token") if status in (200, 201) else None
    if not new or permission(new) != "sending_access":
        print(f"Could not create a sending-access key (HTTP {status}). Nothing changed.")
        return 1
    write_env(with_key(text, new, replace=True))
    print(f"Stored new sending-access key {SENDING_KEY_NAME!r} (id {created.get('id')}) in services/api/.env.")
    status, _ = call("DELETE", f"/api-keys/{matches[0]['id']}", old)
    if status not in (200, 204):
        print(f"Could NOT delete the full-access key {args.delete_name!r} (HTTP {status}): revoke it in the Resend dashboard.")
        return 1
    print(f"Deleted the full-access key {args.delete_name!r} (id {matches[0]['id']}).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    set_key = sub.add_parser("set-key")
    set_key.add_argument("--replace", action="store_true")
    set_key.set_defaults(run=cmd_set_key)
    sub.add_parser("status").set_defaults(run=cmd_status)
    rotate = sub.add_parser("rotate-to-sending")
    rotate.add_argument("--delete-name", required=True)
    rotate.set_defaults(run=cmd_rotate)
    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())
