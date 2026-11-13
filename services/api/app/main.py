import logging
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
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


logger = logging.getLogger("nexova.api")


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(_: Request, __: RequestValidationError):
    # Validation details may contain uploaded values; return locations only.
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": "Request validation failed."}},
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    # Preserve public status and auth headers, but do not echo arbitrary details.
    messages = {
        400: "The request could not be processed.",
        401: "Authentication is required.",
        403: "You are not allowed to perform this action.",
        404: "The requested resource was not found.",
        413: "The uploaded file is too large.",
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": f"http_{exc.status_code}", "message": messages.get(exc.status_code, "The request could not be completed.")}},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, exc: Exception):
    logger.error("Unhandled API error: %s", type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "An unexpected error occurred. Please try again."}},
    )


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}


app.include_router(incidents_router)
