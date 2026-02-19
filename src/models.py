"""Shared data types for the transcript pipeline."""
from dataclasses import dataclass


@dataclass
class ParsedLine:
    """A single timestamped line from the transcript."""
    seconds: int
    text: str


@dataclass
class Segment:
    """A contiguous segment of the transcript between two boundaries."""
    start_sec: int
    end_sec: int
    text: str
    start_ts: str = ""  # human-readable e.g. "1:23:45"
    end_ts: str = ""
