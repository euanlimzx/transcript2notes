"""FastAPI app: POST /convert accepts transcript, returns job id (202). Pipeline runs via Inngest and updates Supabase."""
import asyncio
import errno
import hashlib
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import inngest
import inngest.fast_api
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

GENERIC_ERROR_DETAIL = "An unexpected error occurred with our servers."

load_dotenv()

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    """
    Configure logging so backend logs focus on:
    - pipeline triggers (convert/rerun/process-next)
    - pipeline stage timing
    - LLM calls (Gemini/OpenAI)
    Suppress generic HTTP access / health noise.
    Opt-in to access logs by setting T2N_ACCESS_LOG=1.
    """
    # 1) Root logger: WARNING (so framework noise is off by default)
    root = logging.getLogger()
    if not root.handlers or os.getenv("T2N_FORCE_LOGGING", "0") == "1":
        logging.basicConfig(
            level=logging.WARNING,
            format="%(levelname)s:%(name)s:%(message)s",
            force=True,
        )
    root.setLevel(logging.WARNING)

    # 2) Suppress HTTP access logs unless explicitly enabled
    if os.getenv("T2N_ACCESS_LOG", "0") != "1":
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    # 3) Dedicated stream handler for our pipeline/LLM loggers only
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))

    # Loggers we care about: app + pipeline stages + topic extraction + LLM
    important_loggers = [
        "api",
        "src.pipeline",
        "src.stage1_parse",
        "src.stage2_boundaries",
        "src.stage3_notes",
        "src.topic_extraction",
        "pipeline.llm",
    ]
    for name in important_loggers:
        lg = logging.getLogger(name)
        lg.handlers = []  # avoid duplicate output if reconfigured
        lg.addHandler(handler)
        lg.setLevel(logging.INFO)
        lg.disabled = False
        # Do not propagate to root (prevents double logging and framework noise)
        lg.propagate = False

    # Quiet common chatty libs unless explicitly enabled via their own settings.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("google").setLevel(logging.WARNING)

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

inngest_client = inngest.Inngest(
    app_id=os.getenv("INNGEST_APP_ID", "transcript2notes"),
    is_production=os.getenv("INNGEST_DEV") != "1",  # Production by default; set INNGEST_DEV=1 for local dev
)


@app.exception_handler(HTTPException)
def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Log 5xx and return generic message; pass through 4xx with original detail."""
    if exc.status_code >= 500:
        logger.exception("HTTPException %s: %s", exc.status_code, exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": GENERIC_ERROR_DETAIL},
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
def uncaught_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log uncaught exceptions and return generic message."""
    logger.exception("Uncaught exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": GENERIC_ERROR_DETAIL},
    )


_supabase_client = None


def _get_supabase():
    """Return a cached Supabase client. Avoids creating a new client (and HTTP pool) on every request."""
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client

        url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set")
        _supabase_client = create_client(url, key)
    return _supabase_client


def _is_priority_user(user_id: str) -> bool:
    """Check if user is in priority_users table."""
    try:
        res = (
            _get_supabase()
            .table("priority_users")
            .select("user_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return bool(res.data and len(res.data) > 0)
    except Exception as e:
        logger.warning("Failed to check priority_users for %s: %s", user_id, e)
        return False


def _emit_process_next() -> None:
    """Emit conversion/process-next event to Inngest. Uses send_sync for sync context."""
    try:
        inngest_client.send_sync(
            inngest.Event(name="conversion/process-next", data={}),
        )
        logger.info("Emitted conversion/process-next event")
    except Exception as e:
        logger.warning("Failed to emit process-next event: %s", e)


def _has_pending_jobs() -> bool:
    """Check if any pending conversions exist (for startup emit)."""
    try:
        res = (
            _get_supabase()
            .table("conversions")
            .select("id")
            .eq("status", "pending")
            .limit(1)
            .execute()
        )
        return bool(res.data and len(res.data) > 0)
    except Exception as e:
        logger.warning("Failed to check pending conversions: %s", e)
        return False


def _is_transient_network_error(e: BaseException) -> bool:
    """True if the exception is EAGAIN/EWOULDBLOCK or caused by it (e.g. from httpx/httpcore)."""
    errno_val = getattr(e, "errno", None)
    if errno_val in (errno.EAGAIN, errno.EWOULDBLOCK):
        return True
    cause = getattr(e, "__cause__", None) or getattr(e, "__context__", None)
    if cause is not None:
        return _is_transient_network_error(cause)
    return False


def _get_queue_position(job_id: str) -> int | None:
    """Return number of jobs ahead of this one (0 = next), or None if not pending."""
    last_exc = None
    for attempt in range(3):
        try:
            supabase = _get_supabase()
            # Get all pending jobs ordered by queue
            res = (
                supabase.table("conversions")
                .select("id")
                .eq("status", "pending")
                .order("is_priority", desc=True)
                .order("created_at", desc=False)
                .execute()
            )
            rows = res.data or []
            for i, row in enumerate(rows):
                if row.get("id") == job_id:
                    return i
            return None
        except Exception as e:
            last_exc = e
            if _is_transient_network_error(e) and attempt < 2:
                time.sleep(0.15 * (attempt + 1))
                continue
            logger.warning("Failed to get queue position for %s: %s", job_id, e)
            return None
    logger.warning("Failed to get queue position for %s: %s", job_id, last_exc)
    return None


def _run_pipeline_and_update(job_id: str, transcript: str, user_id: str) -> None:
    def update_progress(progress: str) -> None:
        try:
            _get_supabase().table("conversions").update({"progress": progress}).eq("id", job_id).execute()
        except Exception as e:
            logger.warning("Failed to update progress for %s: %s", job_id, e)

    try:
        from src.pipeline import run_pipeline

        logger.info(
            "[job=%s] Pipeline: start (user_id=%s, transcript_len=%d)",
            job_id,
            user_id,
            len(transcript or ""),
        )
        markdown = run_pipeline(transcript, progress_callback=update_progress, trace_id=job_id)
        supabase = _get_supabase()
        supabase.table("conversions").update(
            {"status": "completed", "markdown": markdown, "progress": None}
        ).eq("id", job_id).execute()
        logger.info("Conversion job %s completed (markdown_len=%d)", job_id, len(markdown))
    except Exception as e:
        logger.exception("Conversion job %s failed: %s", job_id, e)
        try:
            supabase = _get_supabase()
            supabase.table("conversions").update(
                {"status": "failed", "error": str(e), "progress": None}
            ).eq("id", job_id).execute()
        except Exception as update_err:
            logger.exception("Failed to update conversion %s to failed: %s", job_id, update_err)


@inngest_client.create_function(
    fn_id="process-conversion-next",
    trigger=inngest.TriggerEvent(event="conversion/process-next"),
    concurrency=[inngest.Concurrency(limit=1)],
    timeouts=inngest.Timeouts(finish=timedelta(minutes=15)),
)
async def process_conversion_next(ctx: inngest.Context) -> None:
    """Pick next pending job, run pipeline, emit process-next if more pending."""
    supabase = _get_supabase()

    # Step 1: Get next job
    res = (
        supabase.table("conversions")
        .select("id, transcript, user_id, status")
        .eq("status", "pending")
        .order("is_priority", desc=True)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        logger.info("process-conversion-next: no pending jobs")
        return

    row = rows[0]
    job_id = row.get("id")
    transcript = row.get("transcript")
    user_id = row.get("user_id")

    if not job_id or not transcript or not user_id:
        logger.warning("process-conversion-next: invalid job row %s", row)
        return

    # Step 2: Idempotency check
    check = supabase.table("conversions").select("status").eq("id", job_id).single().execute()
    if check.data and check.data.get("status") in ("completed", "failed"):
        logger.info("process-conversion-next: job %s already %s, skipping", job_id, check.data.get("status"))
        _emit_process_next()
        return

    # Step 3: Run pipeline (sync, run in thread to not block)
    await asyncio.to_thread(_run_pipeline_and_update, job_id, transcript, user_id)

    # Step 4: Emit if more pending
    more_res = (
        supabase.table("conversions")
        .select("id")
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if more_res.data and len(more_res.data) > 0:
        _emit_process_next()


# Mount Inngest serve endpoint
inngest.fast_api.serve(app, inngest_client, [process_conversion_next])


class ConvertRequest(BaseModel):
    transcript: str
    userId: str | None = None  # Supabase auth user id; required for tracking


class ConvertAcceptedResponse(BaseModel):
    jobId: str


class RerunRequest(BaseModel):
    jobId: str
    userId: str


class RenameRequest(BaseModel):
    jobId: str
    userId: str
    name: str | None = None


@app.on_event("startup")
def startup() -> None:
    _configure_logging()
    logger.info(
        "Logging configured (access_log=%s, force=%s, llm_bodies=%s)",
        os.getenv("T2N_ACCESS_LOG", "0"),
        os.getenv("T2N_FORCE_LOGGING", "0"),
        os.getenv("LLM_LOG_BODIES", "0"),
    )
    mark_stale_pending_conversions()
    if _has_pending_jobs():
        _emit_process_next()
        logger.info("Startup: emitted process-next for pending jobs")


def mark_stale_pending_conversions() -> None:
    """
    On backend startup, mark very old pending jobs as failed so they do not
    appear to be 'stuck forever' in the UI.
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
                    "progress": None,
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
    """Accept transcript, create pending conversion, return job id. Pipeline runs via Inngest."""
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

    supabase = _get_supabase()

    # One job per user
    existing = (
        supabase.table("conversions")
        .select("id")
        .eq("user_id", request.userId)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if existing.data and len(existing.data) > 0:
        raise HTTPException(
            status_code=409,
            detail="You already have a conversion in progress. Wait for it to finish or close the tab.",
        )

    transcript_hash = hashlib.sha256(transcript.encode("utf-8")).hexdigest()

    # Hash deduplication: reuse any completed conversion with same transcript hash
    res = (
        supabase.table("conversions")
        .select("id, markdown")
        .eq("transcript_hash", transcript_hash)
        .eq("status", "completed")
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if rows:
        match = rows[0]
        cached_markdown = match.get("markdown") or ""
        job_id = str(uuid.uuid4())
        is_priority = _is_priority_user(request.userId)
        supabase.table("conversions").insert(
            {
                "id": job_id,
                "status": "completed",
                "markdown": cached_markdown,
                "transcript": transcript,
                "transcript_hash": transcript_hash,
                "user_id": request.userId,
                "is_priority": is_priority,
            }
        ).execute()
        logger.info("Conversion job %s created from cache (transcript_hash=%s)", job_id, transcript_hash[:16])
        return ConvertAcceptedResponse(jobId=job_id)

    job_id = str(uuid.uuid4())
    is_priority = _is_priority_user(request.userId)
    supabase.table("conversions").insert(
        {
            "id": job_id,
            "status": "pending",
            "transcript": transcript,
            "transcript_hash": transcript_hash,
            "user_id": request.userId,
            "is_priority": is_priority,
        }
    ).execute()

    _emit_process_next()

    logger.info("Conversion job %s created (transcript_len=%d)", job_id, len(transcript))
    return ConvertAcceptedResponse(jobId=job_id)


@app.post("/api/convert/rerun", response_model=ConvertAcceptedResponse, status_code=202)
def rerun(request: RerunRequest) -> ConvertAcceptedResponse:
    """Re-run a failed conversion using its stored transcript."""
    supabase = _get_supabase()

    # One job per user
    existing = (
        supabase.table("conversions")
        .select("id")
        .eq("user_id", request.userId)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if existing.data and len(existing.data) > 0:
        raise HTTPException(
            status_code=409,
            detail="You already have a conversion in progress. Wait for it to finish or close the tab.",
        )

    res = (
        supabase.table("conversions")
        .select("id, user_id, status, transcript")
        .eq("id", request.jobId)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Conversion not found")
    row = rows[0]

    if row.get("user_id") != request.userId:
        raise HTTPException(status_code=403, detail="Not authorized to re-run this conversion")
    if row.get("status") != "failed":
        raise HTTPException(status_code=400, detail="Can only re-run failed conversions")
    transcript = row.get("transcript")
    if not transcript:
        raise HTTPException(status_code=400, detail="No transcript stored for this conversion")

    job_id = str(uuid.uuid4())
    transcript_hash = hashlib.sha256(transcript.encode("utf-8")).hexdigest()
    is_priority = _is_priority_user(request.userId)
    supabase.table("conversions").insert(
        {
            "id": job_id,
            "status": "pending",
            "transcript": transcript,
            "transcript_hash": transcript_hash,
            "user_id": request.userId,
            "is_priority": is_priority,
        }
    ).execute()

    _emit_process_next()

    logger.info("Re-run job %s created from failed job %s", job_id, request.jobId)
    return ConvertAcceptedResponse(jobId=job_id)


@app.post("/api/conversions/rename")
def rename_conversion(request: RenameRequest):
    """Rename a conversion owned by the user."""
    supabase = _get_supabase()

    res = (
        supabase.table("conversions")
        .select("id, user_id")
        .eq("id", request.jobId)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Conversion not found")
    row = rows[0]

    if row.get("user_id") != request.userId:
        raise HTTPException(status_code=403, detail="Not authorized to rename this conversion")

    name = (request.name or "").strip()
    supabase.table("conversions").update({"name": name or None}).eq("id", request.jobId).execute()
    logger.info("Renamed conversion %s", request.jobId)
    return {"ok": True}


@app.get("/api/conversions/{job_id}/queue-position")
def get_queue_position(job_id: str, userId: str | None = None):
    """Return jobs_before count for a pending conversion. Requires userId; verifies ownership."""
    if not userId:
        raise HTTPException(status_code=401, detail="userId is required; sign in to check queue position")
    supabase = _get_supabase()
    res = (
        supabase.table("conversions")
        .select("id, user_id, status")
        .eq("id", job_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Job not found")
    row = rows[0]
    if row.get("user_id") != userId:
        raise HTTPException(status_code=403, detail="Not authorized to view this conversion")
    pos = _get_queue_position(job_id)
    if pos is None:
        raise HTTPException(status_code=404, detail="Job not found or not pending")
    return {"jobs_before": pos}


@app.delete("/api/conversions/{job_id}")
def delete_conversion(job_id: str, userId: str | None = None):
    """Delete a conversion by id. Requires userId; verifies ownership. Returns 204 on success."""
    from fastapi.responses import Response

    if not userId:
        raise HTTPException(status_code=401, detail="userId is required; sign in to delete")
    supabase = _get_supabase()
    res = (
        supabase.table("conversions")
        .select("id, user_id")
        .eq("id", job_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Conversion not found")
    row = rows[0]
    if row.get("user_id") != userId:
        raise HTTPException(status_code=403, detail="Not authorized to delete this conversion")
    supabase.table("conversions").delete().eq("id", job_id).execute()
    return Response(status_code=204)
