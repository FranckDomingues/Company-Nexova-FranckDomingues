import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.incidents import router as incidents_router

app = FastAPI(
    title="Nexova Solutions API",
    version="0.1.0",
    description="Backend API for Nexova Solutions",
)

# Local-only origins used by the static backoffice during development.
# Do not widen this list when deploying the API.
allowed_origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]
codespace_name = os.getenv("CODESPACE_NAME")
forwarding_domain = os.getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
if codespace_name and forwarding_domain:
    allowed_origins.append(
        f"https://{codespace_name}-5500.{forwarding_domain}"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    allow_credentials=bool(codespace_name and forwarding_domain),
)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}


app.include_router(incidents_router)
