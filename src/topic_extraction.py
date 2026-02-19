"""Topic extraction: one pass over the transcript to get major topics, used as context for boundary detection."""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from .llm_client import complete
from .models import ParsedLine
from .stage1_parse import seconds_to_timestamp, slice_for_llm, MAX_CHARS_PER_SLICE
from . import prompts_config

logger = logging.getLogger(__name__)

# Use same char limit as Stage 1 for Option A (full transcript in one call)
TOPIC_EXTRACTION_MAX_CHARS = MAX_CHARS_PER_SLICE

MAX_CONCURRENT_TOPIC_REQUESTS = 5


def _format_lines_for_prompt(lines: list[ParsedLine]) -> str:
    """Format parsed lines for LLM: with timestamps if present, otherwise with 1-based line numbers."""
    if all(ln.seconds is not None for ln in lines):
        return "\n".join(f"{seconds_to_timestamp(ln.seconds)} {ln.text}" for ln in lines)
    return "\n".join(f"{i} {ln.text}" for i, ln in enumerate(lines, start=1))


def _parse_topic_list(content: str) -> list[str]:
    """Parse LLM output into ordered list of topic labels (one per line, stripped)."""
    topics = []
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        # Remove leading numbering or bullets if present
        if line and line[0].isdigit():
            rest = line.lstrip("0123456789.)- ")
            if rest:
                line = rest
        elif line.startswith("- ") or line.startswith("* "):
            line = line[2:].strip()
        topics.append(line)
    return topics


def _extract_topics_full(transcript_text: str, model: str, api_key: str | None) -> list[str]:
    """Option A: single call with full transcript."""
    raw = complete(
        prompts_config.TOPIC_EXTRACTION_FULL,
        transcript_text,
        model,
        api_key=api_key,
    )
    return _parse_topic_list(raw)


def _extract_topics_chunk(chunk_text: str, model: str, api_key: str | None) -> list[str]:
    """Option B: one chunk - return topic list for this segment."""
    raw = complete(
        prompts_config.TOPIC_EXTRACTION_CHUNK,
        chunk_text,
        model,
        api_key=api_key,
    )
    return _parse_topic_list(raw)


def _merge_topic_lists(
    segment_topic_lists: list[list[str]], model: str, api_key: str | None
) -> list[str]:
    """Merge per-segment topic lists into one ordered list via LLM."""
    formatted = "\n".join(
        f"Segment {i + 1}: " + ", ".join(topics)
        for i, topics in enumerate(segment_topic_lists)
        if topics
    )
    if not formatted.strip():
        return []
    raw = complete(
        prompts_config.TOPIC_MERGE,
        formatted,
        model,
        api_key=api_key,
    )
    return _parse_topic_list(raw)


def extract_topics(
    lines: list[ParsedLine],
    model: str = "gemini-3-flash-preview",
    api_key: str | None = None,
) -> list[str]:
    """
    Extract major topics/examples from the lecture in order.
    - Option A: if transcript fits in TOPIC_EXTRACTION_MAX_CHARS, one LLM call on full text.
    - Option B: otherwise chunk by time (same as Stage 1), one call per chunk in parallel, then merge via one LLM call.
    """
    if not lines:
        return []

    total_chars = sum(len(ln.text) + 1 for ln in lines)

    if total_chars <= TOPIC_EXTRACTION_MAX_CHARS:
        logger.info("Topic extraction: Option A (full transcript, %d chars)", total_chars)
        transcript_text = _format_lines_for_prompt(lines)
        return _extract_topics_full(transcript_text, model, api_key)

    # Option B: chunk and merge
    chunks = slice_for_llm(lines)
    logger.info(
        "Topic extraction: Option B (chunked, %d chars, %d chunks)",
        total_chars,
        len(chunks),
    )
    chunk_texts = [_format_lines_for_prompt(c) for c in chunks]
    segment_topic_lists: list[list[str]] = []
    workers = min(MAX_CONCURRENT_TOPIC_REQUESTS, len(chunk_texts))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_extract_topics_chunk, ct, model, api_key): i
            for i, ct in enumerate(chunk_texts)
        }
        results: list[tuple[int, list[str]]] = []
        for future in as_completed(futures):
            idx = futures[future]
            try:
                topics = future.result()
                results.append((idx, topics))
            except Exception as e:
                logger.warning("Topic extraction failed for chunk %s: %s", idx, e)
    # Restore order
    results.sort(key=lambda x: x[0])
    segment_topic_lists = [t for _, t in results]
    if not segment_topic_lists:
        return []
    return _merge_topic_lists(segment_topic_lists, model, api_key)