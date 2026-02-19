"""Stage 2: LLM boundary detection (parallel when multiple slices) and segment building."""
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI

from .models import ParsedLine, Segment
from .stage1_parse import timestamp_to_seconds, seconds_to_timestamp
from . import prompts_config

logger = logging.getLogger(__name__)

# Merge boundaries within this many seconds (avoid duplicates from overlapping slices)
BOUNDARY_MERGE_WINDOW_SEC = 30

# Minimum segment duration in seconds; boundaries that would create a shorter segment are dropped (Fix 2)
MIN_SEGMENT_DURATION_SEC = 180

# Cap concurrent API calls to respect rate limits
MAX_CONCURRENT_REQUESTS = 5


def _format_slice_for_prompt(lines: list[ParsedLine]) -> str:
    """Format parsed lines as transcript text with timestamps."""
    return "\n".join(f"{seconds_to_timestamp(ln.seconds)} {ln.text}" for ln in lines)


def _call_llm_for_slice(
    client: OpenAI,
    slice_text: str,
    model: str,
    system_prompt: str,
) -> str:
    """Single LLM call for one slice. Returns raw response content."""
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": slice_text},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def _parse_timestamps_from_response(content: str) -> list[int]:
    """Extract timestamp strings from model output and return sorted list of seconds."""
    seen: set[int] = set()
    seconds_list: list[int] = []
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        # Try to parse first token as timestamp (in case model added "Timestamp: 1:23")
        parts = line.split()
        for part in parts:
            part = part.rstrip(".,")
            sec = timestamp_to_seconds(part)
            if sec is not None and sec not in seen:
                seen.add(sec)
                seconds_list.append(sec)
            break  # only first token per line
    return sorted(seconds_list)


def _merge_boundaries(boundary_seconds: list[int]) -> list[int]:
    """Sort, dedupe, and merge boundaries within BOUNDARY_MERGE_WINDOW_SEC."""
    if not boundary_seconds:
        return []
    sorted_sec = sorted(set(boundary_seconds))
    merged = [sorted_sec[0]]
    for s in sorted_sec[1:]:
        if s - merged[-1] >= BOUNDARY_MERGE_WINDOW_SEC:
            merged.append(s)
    return merged


def _apply_min_segment_duration(
    boundaries: list[int],
    min_duration_sec: int = MIN_SEGMENT_DURATION_SEC,
) -> list[int]:
    """Drop boundaries that would create a segment shorter than min_duration_sec (Fix 2)."""
    if not boundaries or len(boundaries) < 3:
        return boundaries
    kept = [boundaries[0]]
    for b in boundaries[1:-1]:
        if b - kept[-1] >= min_duration_sec:
            kept.append(b)
    kept.append(boundaries[-1])
    return kept


def _build_segments(
    lines: list[ParsedLine],
    boundaries_sec: list[int],
) -> list[Segment]:
    """Build segments from consecutive boundary pairs. Boundaries must include start and end of transcript."""
    if not boundaries_sec or len(boundaries_sec) < 2:
        # Fallback: one segment = whole transcript
        if not lines:
            return []
        start = lines[0].seconds
        end = lines[-1].seconds
        text = " ".join(ln.text for ln in lines)
        return [
            Segment(
                start_sec=start,
                end_sec=end,
                text=text,
                start_ts=seconds_to_timestamp(start),
                end_ts=seconds_to_timestamp(end),
            )
        ]

    segments: list[Segment] = []
    for i in range(len(boundaries_sec) - 1):
        t_start, t_end = boundaries_sec[i], boundaries_sec[i + 1]
        is_last = i == len(boundaries_sec) - 2
        if is_last:
            chunk = [ln for ln in lines if t_start <= ln.seconds <= t_end]
        else:
            chunk = [ln for ln in lines if t_start <= ln.seconds < t_end]
        if not chunk:
            continue
        text = " ".join(ln.text for ln in chunk)
        segments.append(
            Segment(
                start_sec=t_start,
                end_sec=t_end,
                text=text,
                start_ts=seconds_to_timestamp(t_start),
                end_ts=seconds_to_timestamp(t_end),
            )
        )
    return segments


def run_stage2(
    lines: list[ParsedLine],
    slices: list[list[ParsedLine]],
    model: str = "gpt-4o-mini",
    api_key: str | None = None,
    topics: list[str] | None = None,
) -> list[Segment]:
    """
    Run Stage 2: call LLM for each slice (in parallel if multiple), merge boundaries, build segments.
    If topics is provided, the boundary prompt is constrained to those topics; otherwise uses fallback prompt.
    """
    client = OpenAI(api_key=api_key)  # None => env OPENAI_API_KEY

    system_prompt = (
        prompts_config.boundary_prompt_with_topics(topics)
        if topics
        else prompts_config.BOUNDARY_PROMPT_MAJOR_SECTION
    )

    # Collect boundary seconds from each slice
    if len(slices) == 1:
        slice_text = _format_slice_for_prompt(slices[0])
        content = _call_llm_for_slice(client, slice_text, model, system_prompt)
        all_seconds = _parse_timestamps_from_response(content)
    else:
        slice_texts = [_format_slice_for_prompt(s) for s in slices]
        all_seconds = []
        workers = min(MAX_CONCURRENT_REQUESTS, len(slices))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    _call_llm_for_slice, client, st, model, system_prompt
                ): i
                for i, st in enumerate(slice_texts)
            }
            for future in as_completed(futures):
                try:
                    content = future.result()
                    all_seconds.extend(_parse_timestamps_from_response(content))
                except Exception as e:
                    logger.warning("LLM call failed for slice %s: %s", futures[future], e)

    # Normalize boundaries: prepend start, append end, merge nearby
    if not lines:
        return []
    t_start = lines[0].seconds
    t_end = lines[-1].seconds
    boundaries = _merge_boundaries(all_seconds)
    if boundaries and boundaries[0] != t_start:
        boundaries.insert(0, t_start)
    if boundaries and boundaries[-1] != t_end:
        boundaries.append(t_end)
    if len(boundaries) < 2:
        boundaries = [t_start, t_end]

    boundaries = _apply_min_segment_duration(boundaries)
    return _build_segments(lines, boundaries)
