from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import router
from app.core.config import settings
from app.db import get_session_factory

app = FastAPI(title="BugHound API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Runner-Secret"],
)
app.include_router(router)


@app.get("/health/live")
def liveness() -> dict:
    return {"status": "alive"}


@app.get("/health/ready")
def readiness() -> dict:
    if not settings.ready_configuration:
        raise HTTPException(status_code=503, detail="DATABASE_URL and a 32-character JWT_SECRET are required")
    try:
        with get_session_factory()() as db:
            db.execute(text("SELECT 1"))
    except Exception as error:
        raise HTTPException(status_code=503, detail="Database is unavailable") from error
    return {
        "status": "ready",
        "openrouter_configured": bool(settings.openrouter_api_key),
        "github_write_configured": bool(settings.github_token),
        "external_runner_configured": bool(settings.ci_runner_url and settings.ci_runner_token and settings.runner_callback_secret),
    }
