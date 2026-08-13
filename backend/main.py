"""Application entry point: CORS, router mount, health check."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import storage
from routes import router

app = FastAPI(
    title="Weather Explorer API",
    description=(
        "Fetches historical daily weather from Open-Meteo, stores the raw "
        "response in object storage, and serves it back for visualisation."
    ),
    version="1.0.0",
)

# The dashboard is deployed on a different origin, so the browser needs
# explicit permission. Open here because the API holds no user data and
# every endpoint is read-only apart from writing public weather records.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {
        "service": "Weather Explorer API",
        "status": "ok",
        "storage_backend": storage.backend_name(),
    }


@app.get("/health")
def health():
    """Liveness probe for the hosting platform."""
    return {"status": "ok"}


@app.get("/debug-env")
def debug_env():
    """Temporary: check which storage env vars Render sees. Remove after debugging."""
    import os
    bucket = os.getenv("S3_BUCKET")
    key_id = os.getenv("AWS_ACCESS_KEY_ID")
    endpoint = os.getenv("S3_ENDPOINT_URL")
    return {
        "S3_BUCKET": bucket if bucket else None,
        "AWS_ACCESS_KEY_ID": f"{key_id[:6]}..." if key_id else None,
        "S3_ENDPOINT_URL": endpoint if endpoint else None,
        "use_s3": bool(bucket and key_id),
    }