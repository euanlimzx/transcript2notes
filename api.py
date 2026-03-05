"""FastAPI app: POST /convert accepts transcript, returns job id (202). Pipeline runs in background and updates Supabase."""
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger("uvicorn")

app = FastAPI(title="Transcript2Notes API")
_STARTED_AT = time.time()

allow_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").strip().split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def _get_supabase():
    from supabase import create_client

    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


class ConvertRequest(BaseModel):
    transcript: str
    userId: str | None = None  # Supabase auth user id; required for tracking


class ConvertAcceptedResponse(BaseModel):
    jobId: str


def _run_pipeline_and_update(job_id: str, transcript: str) -> None:
    try:
        # Lazy import so cold-start/health-check stays lightweight.
        from src.pipeline import run_pipeline

        markdown = run_pipeline(transcript)
        supabase = _get_supabase()
        supabase.table("conversions").update(
            {"status": "completed", "markdown": markdown}
        ).eq("id", job_id).execute()
        logger.info("Conversion job %s completed (markdown_len=%d)", job_id, len(markdown))
    except Exception as e:
        logger.exception("Conversion job %s failed: %s", job_id, e)
        try:
            supabase = _get_supabase()
            supabase.table("conversions").update(
                {"status": "failed", "error": str(e)}
            ).eq("id", job_id).execute()
        except Exception as update_err:
            logger.exception("Failed to update conversion %s to failed: %s", job_id, update_err)


@app.on_event("startup")
def mark_stale_pending_conversions() -> None:
    """
    On backend startup, mark very old pending jobs as failed so they do not
    appear to be 'stuck forever' in the UI.

    NOTE: With the current schema we do not store the transcript in Supabase,
    so we cannot actually re-run the pipeline after a restart; we can only
    surface a clear failure message and ask the user to resubmit.
    """
    max_age_minutes_env = os.getenv("PENDING_MAX_AGE_MINUTES", "20")
    try:
        max_age_minutes = int(max_age_minutes_env)
    except ValueError:
        max_age_minutes = 20

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)

    try:
        supabase = _get_supabase()
    except Exception as e:
        logger.warning("Startup: could not create Supabase client; skipping stale pending cleanup: %s", e)
        return

    try:
        res = (
            supabase.table("conversions")
            .select("id, created_at")
            .eq("status", "pending")
            .lt("created_at", cutoff.isoformat())
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        logger.warning("Startup: failed to query pending conversions: %s", e)
        return

    if not rows:
        return

    updated = 0
    for row in rows:
        job_id = row.get("id")
        if not job_id:
            continue
        try:
            supabase.table("conversions").update(
                {
                    "status": "failed",
                    "error": "Backend restarted before this job finished. Please resubmit the transcript.",
                }
            ).eq("id", job_id).execute()
            updated += 1
        except Exception as e:
            logger.warning("Startup: failed to mark conversion %s as failed: %s", job_id, e)

    if updated:
        logger.info("Startup: marked %d stale pending conversion(s) as failed", updated)


@app.get("/health")
def health():
    """Lightweight health endpoint for Render + user 'wake' button."""
    return {
        "ok": True,
        "service": "transcript2notes-backend",
        "uptime_s": round(time.time() - _STARTED_AT, 3),
    }


@app.get("/api/health")
def health_api():
    """Same as /health; convenient when clients assume /api/*."""
    return health()


@app.post("/convert", response_model=ConvertAcceptedResponse, status_code=202)
def convert(request: ConvertRequest) -> ConvertAcceptedResponse:
    """Accept transcript, create pending conversion, return job id. Pipeline runs in background."""
    return _convert_impl(request)


@app.post("/api/convert", response_model=ConvertAcceptedResponse, status_code=202)
def convert_api(request: ConvertRequest) -> ConvertAcceptedResponse:
    """Same as /convert; used when Next rewrites /api/* to this server in dev."""
    logger.info("POST /api/convert received")
    return _convert_impl(request)


def _convert_impl(request: ConvertRequest) -> ConvertAcceptedResponse:
    transcript = (request.transcript or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript is required and cannot be empty")
    if not request.userId:
        raise HTTPException(status_code=401, detail="userId is required; sign in to convert")

    job_id = str(uuid.uuid4())
    supabase = _get_supabase()
    supabase.table("conversions").insert(
        {"id": job_id, "status": "pending", "user_id": request.userId}
    ).execute()

    thread = threading.Thread(target=_run_pipeline_and_update, args=(job_id, transcript), daemon=True)
    thread.start()

    logger.info("Conversion job %s created (transcript_len=%d)", job_id, len(transcript))
    return ConvertAcceptedResponse(jobId=job_id)


@app.delete("/api/conversions/{job_id}")
def delete_conversion(job_id: str):
    """Delete a conversion by id (service role). Returns 204 on success."""
    from fastapi.responses import Response

    supabase = _get_supabase()
    supabase.table("conversions").delete().eq("id", job_id).execute()
    return Response(status_code=204)
