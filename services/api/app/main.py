import os

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.authentication import router as authentication_router
from app.routes.suppliers import router as suppliers_router
from app.routes.users import router as users_router
from app.routes.inventory import router as inventory_router
from app.inventory_models import Asset, AssetEntry, AssetExit  # register metadata before startup
from app.sql_database import get_engine
from sqlmodel import SQLModel


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Local auth/supplier use remains available without inventory credentials;
    # when DATABASE_URL is configured, initialize the registered schema at startup.
    if os.environ.get("DATABASE_URL", "").strip():
        SQLModel.metadata.create_all(get_engine())
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Nexova Solutions API",
    version="0.2.0",
    description="Nexova company API, including the supplier directory.",
)

allowed_origins = os.environ.get(
    "API_ALLOWED_ORIGINS",
    "http://127.0.0.1:5500,http://localhost:5500",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(authentication_router)
app.include_router(users_router)
app.include_router(suppliers_router)
app.include_router(inventory_router)


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
