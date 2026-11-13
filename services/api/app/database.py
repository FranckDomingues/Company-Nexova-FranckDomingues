"""SQLAlchemy persistence; SQLite by default, PostgreSQL by DATABASE_URL."""
import os
from functools import lru_cache
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "incidents.db"


class Base(DeclarativeBase):
    pass


@lru_cache(maxsize=8)
def engine_for(url: str):
    options = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=options, future=True)


def database_url() -> str:
    return os.environ.get("DATABASE_URL", f"sqlite:///{DEFAULT_DB}")


def get_session_factory():
    return sessionmaker(bind=engine_for(database_url()), expire_on_commit=False)


def get_session():
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def create_schema() -> None:
    from app.orm import IncidentRecord  # noqa: F401
    Base.metadata.create_all(engine_for(database_url()))
