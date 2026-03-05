"""Stage 3: Turn each segment into markdown study notes via LLM (parallel per segment)."""
from collections.abc import Callable
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from .llm_client import complete
from .models import Segment
from . import prompts_config

logger = logging.getLogger(__name__)

MAX_CONCURRENT_REQUESTS = 5


def _call_llm_for_segment(
    segment_text: str,
    model: str,
    api_key: str | None,
) -> str:
    """Single LLM call for one segment. Returns raw markdown notes."""
    return complete(
        prompts_config.TRANSCRIPT_TO_NOTES,
        segment_text,
        model,
        api_key=api_key,
        label="notes",
    )


def _section_heading(segment: Segment, index: int) -> str:
    """Build ## heading for this segment; include timestamps when available."""
    one_based = index + 1
    if segment.start_ts and segment.end_ts:
        return f"## Section {one_based} ({segment.start_ts} – {segment.end_ts})"
    return f"## Section {one_based}"


def run_stage3(
    segments: list[Segment],
    model: str = "gemini-3-flash-preview",
    api_key: str | None = None,
    progress_callback: Callable[[str], None] | None = None,
) -> str:
    """
    Run Stage 3: for each segment, call LLM in parallel to convert transcript to
    markdown study notes; assemble in order with section headings (timestamps when
    available). Returns full markdown document.
    """
    if not segments:
        return ""

    n = len(segments)
    workers = min(MAX_CONCURRENT_REQUESTS, n)
    results: list[tuple[int, str]] = []
    completed = 0

    def on_segment_done() -> None:
        nonlocal completed
        completed += 1
        if progress_callback:
            progress_callback(f"generating_notes ({completed}/{n})")

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                _call_llm_for_segment,
                seg.text,
                model,
                api_key,
            ): i
            for i, seg in enumerate(segments)
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                content = future.result()
                results.append((idx, content))
            except Exception as e:
                logger.warning("Notes generation failed for segment %s: %s", idx + 1, e)
                results.append((idx, f"*[Segment {idx + 1}: generation failed]*"))
            on_segment_done()

    results.sort(key=lambda x: x[0])
    parts: list[str] = []
    for idx, content in results:
        heading = _section_heading(segments[idx], idx)
        parts.append(heading)
        parts.append("")
        parts.append(content)
        parts.append("")

    return "\n".join(parts).strip()
