"""Shared data types for the transcript pipeline."""
from dataclasses import dataclass


@dataclass
class ParsedLine:
    """A single line from the transcript. seconds is None when input has no timestamps."""
    text: str
    seconds: int | None = None  # None = plain transcript, no timestamp


@dataclass
class Segment:
    """A contiguous segment of the transcript between two boundaries."""
    text: str
    start_sec: int | None = None
    end_sec: int | None = None
    start_ts: str = ""
    end_ts: str = ""
