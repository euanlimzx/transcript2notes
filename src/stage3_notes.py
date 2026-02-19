"""Stage 3: Turn each segment into markdown study notes via LLM (parallel per segment)."""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI

from .models import Segment
from . import prompts_config

logger = logging.getLogger(__name__)

MAX_CONCURRENT_REQUESTS = 5


def _call_llm_for_segment(
    client: OpenAI,
    segment_text: str,
    model: str,
) -> str:
    """Single LLM call for one segment. Returns raw markdown notes."""
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": prompts_config.TRANSCRIPT_TO_NOTES},
            {"role": "user", "content": segment_text},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def _section_heading(segment: Segment, index: int) -> str:
    """Build ## heading for this segment; include timestamps when available."""
    one_based = index + 1
    if segment.start_ts and segment.end_ts:
        return f"## Section {one_based} ({segment.start_ts} – {segment.end_ts})"
    return f"## Section {one_based}"


def run_stage3(
    segments: list[Segment],
    model: str = "gpt-4o-mini",
    api_key: str | None = None,
) -> str:
    """
    Run Stage 3: for each segment, call LLM in parallel to convert transcript to
    markdown study notes; assemble in order with section headings (timestamps when
    available). Returns full markdown document.
    """
    if not segments:
        return ""

    client = OpenAI(api_key=api_key)
    workers = min(MAX_CONCURRENT_REQUESTS, len(segments))
    results: list[tuple[int, str]] = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                _call_llm_for_segment,
                client,
                seg.text,
                model,
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

    results.sort(key=lambda x: x[0])
    parts: list[str] = []
    for idx, content in results:
        heading = _section_heading(segments[idx], idx)
        parts.append(heading)
        parts.append("")
        parts.append(content)
        parts.append("")

    return "\n".join(parts).strip()
