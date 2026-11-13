import os
from functools import lru_cache
from pathlib import Path

from tinydb import TinyDB
from tinydb.table import Table

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "suppliers.json"


@lru_cache(maxsize=8)
def _database_for(path: str) -> TinyDB:
    database_path = Path(path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    return TinyDB(database_path)


def get_database() -> TinyDB:
    path = os.environ.get("SUPPLIER_DB_PATH", str(DEFAULT_DATABASE_PATH))
    return _database_for(path)


def get_suppliers_table() -> Table:
    return get_database().table("suppliers")


def get_users_table() -> Table:
    return get_database().table("users")


def get_profiles_table() -> Table:
    return get_database().table("profiles")
