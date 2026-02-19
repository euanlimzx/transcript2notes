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

# When using line-number boundaries: minimum lines per segment (avoid tiny segments)
MIN_LINES_PER_SEGMENT = 15

# Cap concurrent API calls to respect rate limits
MAX_CONCURRENT_REQUESTS = 5


def _format_slice_for_prompt(lines: list[ParsedLine], use_line_numbers: bool = False) -> str:
    """Format parsed lines for LLM: with timestamps or with 1-based line numbers."""
    if use_line_numbers:
        return "\n".join(f"{i} {ln.text}" for i, ln in enumerate(lines, start=1))
    return "\n".join(
        f"{seconds_to_timestamp(ln.seconds)} {ln.text}" for ln in lines if ln.seconds is not None
    )


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


def _parse_line_numbers_from_response(content: str) -> list[int]:
    """Extract line numbers (1-based) from model output. Returns sorted unique integers."""
    seen: set[int] = set()
    numbers: list[int] = []
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        for part in parts:
            part = part.rstrip(".,)")
            try:
                n = int(part)
                if n >= 1 and n not in seen:
                    seen.add(n)
                    numbers.append(n)
            except ValueError:
                pass
            break
    return sorted(numbers)


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
    has_timestamps: bool,
) -> list[Segment]:
    """Build segments from consecutive boundary pairs (time-based). Boundaries must include start and end."""
    if not boundaries_sec or len(boundaries_sec) < 2:
        if not lines:
            return []
        text = " ".join(ln.text for ln in lines)
        if has_timestamps and lines[0].seconds is not None and lines[-1].seconds is not None:
            start = lines[0].seconds
            end = lines[-1].seconds
            return [
                Segment(
                    text=text,
                    start_sec=start,
                    end_sec=end,
                    start_ts=seconds_to_timestamp(start),
                    end_ts=seconds_to_timestamp(end),
                )
            ]
        return [Segment(text=text)]

    segments: list[Segment] = []
    for i in range(len(boundaries_sec) - 1):
        t_start, t_end = boundaries_sec[i], boundaries_sec[i + 1]
        is_last = i == len(boundaries_sec) - 2
        if is_last:
            chunk = [ln for ln in lines if ln.seconds is not None and t_start <= ln.seconds <= t_end]
        else:
            chunk = [ln for ln in lines if ln.seconds is not None and t_start <= ln.seconds < t_end]
        if not chunk:
            continue
        text = " ".join(ln.text for ln in chunk)
        segments.append(
            Segment(
                text=text,
                start_sec=t_start,
                end_sec=t_end,
                start_ts=seconds_to_timestamp(t_start),
                end_ts=seconds_to_timestamp(t_end),
            )
        )
    return segments


def _apply_min_lines_per_segment(
    boundary_indices: list[int],
    total_lines: int,
    min_lines: int = MIN_LINES_PER_SEGMENT,
) -> list[int]:
    """Drop boundaries that would create a segment with fewer than min_lines lines."""
    if not boundary_indices or len(boundary_indices) < 3:
        return boundary_indices
    kept = [boundary_indices[0]]
    for b in boundary_indices[1:-1]:
        if b - kept[-1] >= min_lines:
            kept.append(b)
    kept.append(boundary_indices[-1])
    return kept


def _build_segments_from_line_boundaries(
    lines: list[ParsedLine],
    boundary_indices_0based: list[int],
) -> list[Segment]:
    """Build segments from line-number boundaries (no timestamps in output)."""
    if not boundary_indices_0based or len(boundary_indices_0based) < 2:
        if not lines:
            return []
        return [Segment(text=" ".join(ln.text for ln in lines))]

    segments: list[Segment] = []
    for i in range(len(boundary_indices_0based) - 1):
        start_idx = boundary_indices_0based[i]
        end_idx = boundary_indices_0based[i + 1]
        chunk = lines[start_idx:end_idx]
        if not chunk:
            continue
        text = " ".join(ln.text for ln in chunk)
        segments.append(Segment(text=text))
    return segments


def _slice_start_indices(lines: list[ParsedLine], slices: list[list[ParsedLine]]) -> list[int]:
    """Return the global 0-based line index of the first line of each slice."""
    indices: list[int] = []
    for s in slices:
        if not s:
            indices.append(0)
            continue
        # Find first occurrence of s[0] in lines (by identity)
        idx = next((i for i, ln in enumerate(lines) if ln is s[0]), 0)
        indices.append(idx)
    return indices


def run_stage2(
    lines: list[ParsedLine],
    slices: list[list[ParsedLine]],
    model: str = "gpt-4o-mini",
    api_key: str | None = None,
    topics: list[str] | None = None,
) -> list[Segment]:
    """
    Run Stage 2: call LLM for each slice (in parallel if multiple), merge boundaries, build segments.
    If input has timestamps, uses timestamp-based boundaries and output includes timestamps.
    If input has no timestamps, uses line-number boundaries and output has no timestamps.
    """
    if not lines:
        return []

    client = OpenAI(api_key=api_key)  # None => env OPENAI_API_KEY
    has_timestamps = all(ln.seconds is not None for ln in lines)

    if has_timestamps:
        return _run_stage2_timestamped(client, lines, slices, model, topics)
    return _run_stage2_line_numbers(client, lines, slices, model, topics)


def _run_stage2_timestamped(
    client: OpenAI,
    lines: list[ParsedLine],
    slices: list[list[ParsedLine]],
    model: str,
    topics: list[str] | None,
) -> list[Segment]:
    """Timestamp-based boundary detection (original flow)."""
    system_prompt = (
        prompts_config.boundary_prompt_with_topics(topics)
        if topics
        else prompts_config.BOUNDARY_PROMPT_MAJOR_SECTION
    )

    if len(slices) == 1:
        slice_text = _format_slice_for_prompt(slices[0], use_line_numbers=False)
        content = _call_llm_for_slice(client, slice_text, model, system_prompt)
        all_seconds = _parse_timestamps_from_response(content)
    else:
        slice_texts = [_format_slice_for_prompt(s, use_line_numbers=False) for s in slices]
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

    t_start = lines[0].seconds if lines[0].seconds is not None else 0
    t_end = lines[-1].seconds if lines[-1].seconds is not None else 0
    boundaries = _merge_boundaries(all_seconds)
    if boundaries and boundaries[0] != t_start:
        boundaries.insert(0, t_start)
    if boundaries and boundaries[-1] != t_end:
        boundaries.append(t_end)
    if len(boundaries) < 2:
        boundaries = [t_start, t_end]

    boundaries = _apply_min_segment_duration(boundaries)
    return _build_segments(lines, boundaries, has_timestamps=True)


def _run_stage2_line_numbers(
    client: OpenAI,
    lines: list[ParsedLine],
    slices: list[list[ParsedLine]],
    model: str,
    topics: list[str] | None,
) -> list[Segment]:
    """Line-number-based boundary detection when transcript has no timestamps."""
    system_prompt = (
        prompts_config.boundary_prompt_line_numbers_with_topics(topics)
        if topics
        else prompts_config.BOUNDARY_PROMPT_LINE_NUMBERS
    )

    start_indices = _slice_start_indices(lines, slices)

    if len(slices) == 1:
        slice_text = _format_slice_for_prompt(slices[0], use_line_numbers=True)
        content = _call_llm_for_slice(client, slice_text, model, system_prompt)
        line_nums = _parse_line_numbers_from_response(content)
        global_indices = [start_indices[0] + (n - 1) for n in line_nums]
    else:
        slice_texts = [_format_slice_for_prompt(s, use_line_numbers=True) for s in slices]
        all_global_indices: list[int] = []
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
                    idx = futures[future]
                    content = future.result()
                    line_nums = _parse_line_numbers_from_response(content)
                    base = start_indices[idx]
                    all_global_indices.extend(base + (n - 1) for n in line_nums)
                except Exception as e:
                    logger.warning("LLM call failed for slice %s: %s", futures[future], e)
        global_indices = sorted(set(all_global_indices))

    # Ensure first and last boundaries
    n_lines = len(lines)
    boundaries = [0] + [i for i in global_indices if 0 < i < n_lines] + [n_lines]
    boundaries = sorted(set(boundaries))
    # Merge boundaries that are too close (min lines per segment)
    boundaries = _apply_min_lines_per_segment(boundaries, n_lines)
    return _build_segments_from_line_boundaries(lines, boundaries)
