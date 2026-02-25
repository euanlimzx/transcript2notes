"""FastAPI app: POST /convert accepts transcript, returns job id (202). Pipeline runs in background and updates Supabase."""
import logging
import os
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.pipeline import run_pipeline

load_dotenv()

logger = logging.getLogger("uvicorn")

app = FastAPI(title="Transcript2Notes API")

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


class ConvertAcceptedResponse(BaseModel):
    jobId: str


def _run_pipeline_and_update(job_id: str, transcript: str) -> None:
    try:
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

    job_id = str(uuid.uuid4())
    supabase = _get_supabase()
    supabase.table("conversions").insert(
        {"id": job_id, "status": "pending"}
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
