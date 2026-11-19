import os
from functools import lru_cache
from pathlib import Path

from tinydb import TinyDB
from tinydb.table import Table

API_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_PATH = API_DIR / "data" / "suppliers.json"


@lru_cache(maxsize=8)
def _database_for(path: str) -> TinyDB:
    database_path = Path(path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    return TinyDB(database_path)


def resolve_database_path() -> Path:
    """Resolve SUPPLIER_DB_PATH independently of the process working directory.

    Relative values (such as ``./data/suppliers.json`` in ``.env``) are anchored to
    ``services/api`` so the API, the seed and scripts always share one TinyDB file.
    """
    raw = os.environ.get("SUPPLIER_DB_PATH", "").strip()
    if not raw:
        return DEFAULT_DATABASE_PATH
    path = Path(raw).expanduser()
    return path if path.is_absolute() else (API_DIR / path).resolve()


def get_database() -> TinyDB:
    return _database_for(str(resolve_database_path()))


def get_suppliers_table() -> Table:
    return get_database().table("suppliers")


def get_users_table() -> Table:
    return get_database().table("users")


def get_profiles_table() -> Table:
    return get_database().table("profiles")


def get_password_resets_table() -> Table:
    """AUTH-03: one row per reset request (hashed token, expiry, single-use marker)."""
    return get_database().table("password_resets")


def get_password_audit_table() -> Table:
    """AUTH-03 EXTRA-03: password recovery/change audit events (no passwords, no raw tokens)."""
    return get_database().table("password_audit_events")
