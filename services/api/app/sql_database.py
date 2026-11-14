"""PostgreSQL connection infrastructure, separate from TinyDB authentication."""

from collections.abc import Generator
from functools import lru_cache
import os

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url
from sqlmodel import Session, create_engine

load_dotenv()


def database_url_from_environment() -> URL:
    """Read DATABASE_URL and ensure PostgreSQL connections require TLS.

    Configure this with the Supabase transaction-pooler URI (normally port 6543).
    The URI is never included in exception text or logs.
    """
    raw_url = os.environ.get("DATABASE_URL", "").strip()
    if not raw_url:
        raise RuntimeError("DATABASE_URL is required for PostgreSQL inventory persistence")
    try:
        url = make_url(raw_url)
    except Exception:
        raise RuntimeError("DATABASE_URL is not a valid SQLAlchemy URL") from None
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("DATABASE_URL must use PostgreSQL; SQLite is not supported")
    # Enforce TLS regardless of whether the provider's copied URI included it.
    return url.update_query_dict({"sslmode": "require"})


@lru_cache(maxsize=1)
def get_engine():
    """Return the process-wide engine; sessions themselves remain request-scoped."""
    url = database_url_from_environment()
    return create_engine(url, pool_pre_ping=True)


def get_db() -> Generator[Session, None, None]:
    """Yield one SQLModel session per request and always close it afterward."""
    with Session(get_engine()) as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
