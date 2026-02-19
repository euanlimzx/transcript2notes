"""Stage 1: Parse timestamped transcript and optionally slice for LLM context."""
from pathlib import Path

from .models import ParsedLine

# Max characters per LLM request (conservative for gpt-4o-mini context)
MAX_CHARS_PER_SLICE = 90_000
# When slicing: window length and overlap in seconds (25 min, 5 min overlap)
SLICE_WINDOW_SEC = 25 * 60
SLICE_OVERLAP_SEC = 5 * 60


def timestamp_to_seconds(ts: str) -> int | None:
    """Parse M:SS or H:MM:SS to seconds from start. Returns None if invalid."""
    parts = ts.strip().split(":")
    if len(parts) == 2:
        try:
            m, s = int(parts[0]), int(parts[1])
            return 60 * m + s
        except ValueError:
            return None
    if len(parts) == 3:
        try:
            h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
            return 3600 * h + 60 * m + s
        except ValueError:
            return None
    return None


def seconds_to_timestamp(seconds: int) -> str:
    """Format seconds as H:MM:SS or M:SS."""
    h = seconds // 3600
    remainder = seconds % 3600
    m = remainder // 60
    s = remainder % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _parse_raw_lines(raw_lines: list[str]) -> list[ParsedLine]:
    """
    Parse a list of raw transcript lines into ParsedLine list.
    If a line starts with M:SS or H:MM:SS followed by space, that timestamp is stored; otherwise
    the whole line is kept as text with seconds=None. Blank lines are skipped.
    """
    lines: list[ParsedLine] = []
    for raw in raw_lines:
        raw = raw.strip()
        if not raw:
            continue
        first_space = raw.find(" ")
        if first_space > 0:
            ts_str, rest = raw[:first_space], raw[first_space + 1 :].strip()
            sec = timestamp_to_seconds(ts_str)
            if sec is not None:
                lines.append(ParsedLine(text=rest, seconds=sec))
                continue
        lines.append(ParsedLine(text=raw, seconds=None))
    return lines


def parse_transcript(path: Path | str) -> list[ParsedLine]:
    """
    Parse transcript file into ordered list of ParsedLine.
    Accepts any format: if a line starts with M:SS or H:MM:SS followed by space, that timestamp
    is parsed and stored; otherwise the whole line is kept as text with seconds=None.
    Blank lines are skipped.
    """
    path = Path(path)
    with path.open(encoding="utf-8") as f:
        return _parse_raw_lines(f.readlines())


def parse_transcript_from_string(content: str) -> list[ParsedLine]:
    """
    Parse transcript content (string) into ordered list of ParsedLine.
    Same format as parse_transcript: leading M:SS or H:MM:SS per line, blank lines skipped.
    """
    return _parse_raw_lines(content.splitlines())


def slice_for_llm(lines: list[ParsedLine]) -> list[list[ParsedLine]]:
    """
    If total character count exceeds MAX_CHARS_PER_SLICE, return overlapping
    slices. When all lines have timestamps, use time-based windows; otherwise
    use character-based chunks with overlap. Otherwise return [lines] (single slice).
    """
    total_chars = sum(len(line.text) + 1 for line in lines)  # +1 for newline
    if total_chars <= MAX_CHARS_PER_SLICE:
        return [lines]

    if not lines:
        return []

    has_timestamps = all(ln.seconds is not None for ln in lines)
    if has_timestamps and lines[0].seconds is not None and lines[-1].seconds is not None:
        t_start = lines[0].seconds
        t_end = lines[-1].seconds
        slices: list[list[ParsedLine]] = []
        window_start = t_start
        while window_start < t_end:
            window_end = window_start + SLICE_WINDOW_SEC
            chunk = [ln for ln in lines if ln.seconds is not None and window_start <= ln.seconds < window_end]
            if chunk:
                slices.append(chunk)
            window_start = window_end - SLICE_OVERLAP_SEC
        return slices if slices else [lines]

    # No timestamps: character-based slicing with overlap
    overlap_chars = min(MAX_CHARS_PER_SLICE // 4, 20_000)  # 25% or 20k chars overlap
    slices = []
    start = 0
    while start < len(lines):
        chunk: list[ParsedLine] = []
        nchars = 0
        i = start
        while i < len(lines) and nchars + len(lines[i].text) + 1 <= MAX_CHARS_PER_SLICE:
            chunk.append(lines[i])
            nchars += len(lines[i].text) + 1
            i += 1
        if not chunk:
            chunk = [lines[start]]
            start += 1
        else:
            start = i
            # Back up by overlap (by chars) for next window
            if start < len(lines) and overlap_chars > 0:
                overlap_remaining = overlap_chars
                while start > 0 and overlap_remaining > 0:
                    start -= 1
                    overlap_remaining -= len(lines[start].text) + 1
        slices.append(chunk)
    return slices


def run_stage1(path: Path | str) -> tuple[list[ParsedLine], list[list[ParsedLine]]]:
    """
    Run Stage 1: parse transcript file and produce (full lines, slices for LLM).
    Slices are either [full_lines] or overlapping windows when over character limit.
    """
    lines = parse_transcript(path)
    slices = slice_for_llm(lines)
    return lines, slices


def run_stage1_from_content(content: str) -> tuple[list[ParsedLine], list[list[ParsedLine]]]:
    """
    Run Stage 1 from transcript string: parse and produce (full lines, slices for LLM).
    Use this when transcript is in memory (e.g. API request body); no filesystem access.
    """
    lines = parse_transcript_from_string(content)
    slices = slice_for_llm(lines)
    return lines, slices
