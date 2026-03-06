"""Single entry point: transcript string -> markdown notes. Used by the FastAPI /convert endpoint."""
from collections.abc import Callable
import logging
import os
import time

from .stage1_parse import run_stage1_from_content
from .topic_extraction import extract_topics
from .stage2_boundaries import run_stage2
from .stage3_notes import run_stage3

logger = logging.getLogger(__name__)


def run_pipeline(
    transcript: str,
    model: str = "gemini-3-flash-preview",
    no_topics: bool = False,
    api_key: str | None = None,
    progress_callback: Callable[[str], None] | None = None,
    *,
    trace_id: str = "",
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

    prefix = f"[job={trace_id}] " if trace_id else ""
    t0 = time.perf_counter()

    report("parsing")
    logger.info("%sStage 1 (parsing): start (transcript_len=%d)", prefix, len(transcript or ""))
    lines, slices = run_stage1_from_content(transcript)
    logger.info(
        "%sStage 1 (parsing): done (lines=%d, slices=%d, elapsed=%.2fs)",
        prefix,
        len(lines),
        len(slices),
        time.perf_counter() - t0,
    )

    topics = None
    if not no_topics and lines:
        report("extracting_topics")
        t_topics = time.perf_counter()
        logger.info("%sTopic extraction: start", prefix)
        topics = extract_topics(lines, model=model, api_key=api_key, trace_id=trace_id)
        logger.info(
            "%sTopic extraction: done (topics=%d, elapsed=%.2fs)",
            prefix,
            len(topics) if topics else 0,
            time.perf_counter() - t_topics,
        )

    report("segmenting")
    t_seg = time.perf_counter()
    logger.info("%sStage 2 (segmenting): start", prefix)
    segments = run_stage2(lines, slices, model=model, api_key=api_key, topics=topics, trace_id=trace_id)
    logger.info(
        "%sStage 2 (segmenting): done (segments=%d, elapsed=%.2fs)",
        prefix,
        len(segments),
        time.perf_counter() - t_seg,
    )

    t_notes = time.perf_counter()
    report("generating_notes")
    markdown = run_stage3(
        segments,
        model=model,
        api_key=api_key,
        progress_callback=progress_callback,
        trace_id=trace_id,
    )
    logger.info(
        "%sStage 3 (notes): done (markdown_len=%d, elapsed=%.2fs)",
        prefix,
        len(markdown),
        time.perf_counter() - t_notes,
    )
    logger.info("%sPipeline: done (total_elapsed=%.2fs)", prefix, time.perf_counter() - t0)
    return markdown
