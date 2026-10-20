from fastapi import FastAPI

app = FastAPI(
    title="Nexova Solutions API",
    version="0.1.0",
    description="Backend API for Nexova Solutions",
)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}
