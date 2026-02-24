"""Vercel serverless entry: FastAPI app for POST /api/convert."""
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.pipeline import run_pipeline

load_dotenv()

app = FastAPI(title="Transcript2Notes API")

allow_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").strip().split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class ConvertRequest(BaseModel):
    transcript: str


class ConvertResponse(BaseModel):
    markdown: str


def _convert_impl(request: ConvertRequest) -> ConvertResponse:
    transcript = (request.transcript or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript is required and cannot be empty")
    try:
        markdown = run_pipeline(transcript)
        return ConvertResponse(markdown=markdown)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/convert", response_model=ConvertResponse)
def convert_api(request: ConvertRequest) -> ConvertResponse:
    """Convert transcript text to markdown notes (full path for Vercel)."""
    return _convert_impl(request)


@app.post("/convert", response_model=ConvertResponse)
def convert(request: ConvertRequest) -> ConvertResponse:
    """Same handler if Vercel strips /api prefix."""
    return _convert_impl(request)
