"""Single entry point: transcript string -> markdown notes. Used by the FastAPI /convert endpoint."""
from collections.abc import Callable
import os

from .stage1_parse import run_stage1_from_content
from .topic_extraction import extract_topics
from .stage2_boundaries import run_stage2
from .stage3_notes import run_stage3


def run_pipeline(
    transcript: str,
    model: str = "gemini-3-flash-preview",
    no_topics: bool = False,
    api_key: str | None = None,
    progress_callback: Callable[[str], None] | None = None,
) -> str:
    """
    Run the full pipeline: transcript string -> markdown notes.
    Uses GEMINI_API_KEY or GOOGLE_API_KEY from env when api_key is None.
    progress_callback(msg) is called with stage names for UI (e.g. "parsing", "extracting_topics").
    """
    def report(msg: str) -> None:
        if progress_callback:
            progress_callback(msg)

    if api_key is None:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    report("parsing")
    lines, slices = run_stage1_from_content(transcript)

    topics = None
    if not no_topics and lines:
        report("extracting_topics")
        topics = extract_topics(lines, model=model, api_key=api_key)

    report("segmenting")
    segments = run_stage2(
        lines, slices, model=model, api_key=api_key, topics=topics
    )

    return run_stage3(
        segments,
        model=model,
        api_key=api_key,
        progress_callback=progress_callback,
    )
