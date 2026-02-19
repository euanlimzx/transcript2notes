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


def parse_transcript(path: Path | str) -> list[ParsedLine]:
    """Parse transcript file into ordered list of (seconds, text). Skips blank lines."""
    path = Path(path)
    lines: list[ParsedLine] = []
    with path.open(encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            # First space separates timestamp from text
            first_space = raw.find(" ")
            if first_space <= 0:
                continue
            ts_str, text = raw[:first_space], raw[first_space + 1 :].strip()
            sec = timestamp_to_seconds(ts_str)
            if sec is None:
                continue
            lines.append(ParsedLine(seconds=sec, text=text))
    return lines


def slice_for_llm(lines: list[ParsedLine]) -> list[list[ParsedLine]]:
    """
    If total character count exceeds MAX_CHARS_PER_SLICE, return overlapping
    time-based slices. Otherwise return [lines] (single slice).
    """
    total_chars = sum(len(line.text) + 1 for line in lines)  # +1 for newline
    if total_chars <= MAX_CHARS_PER_SLICE:
        return [lines]

    if not lines:
        return []

    t_start = lines[0].seconds
    t_end = lines[-1].seconds
    slices: list[list[ParsedLine]] = []
    window_start = t_start
    while window_start < t_end:
        window_end = window_start + SLICE_WINDOW_SEC
        chunk = [ln for ln in lines if window_start <= ln.seconds < window_end]
        if chunk:
            slices.append(chunk)
        window_start = window_end - SLICE_OVERLAP_SEC
    return slices if slices else [lines]


def run_stage1(path: Path | str) -> tuple[list[ParsedLine], list[list[ParsedLine]]]:
    """
    Run Stage 1: parse transcript and produce (full lines, slices for LLM).
    Slices are either [full_lines] or overlapping windows when over character limit.
    """
    lines = parse_transcript(path)
    slices = slice_for_llm(lines)
    return lines, slices
