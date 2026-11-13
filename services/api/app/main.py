import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.authentication import router as authentication_router
from app.routes.suppliers import router as suppliers_router
from app.routes.users import router as users_router

app = FastAPI(
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


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
