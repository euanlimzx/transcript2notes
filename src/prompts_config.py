"""Centralized prompt strings for LLM calls. Edit here to change behavior without touching business logic."""

# ---- Topic extraction (Part 1) ----

TOPIC_EXTRACTION_FULL = """You are given a full lecture transcript. Your task is to list the MAJOR topics or worked examples covered, in chronological order.

Desired output shape: one line per major section or per complete worked example. Example: if the lecture has an intro, then one long worked example (e.g. building one algorithm or program step by step), then "Syntax", then "Built-ins", then "Advanced topics", you output roughly 5–6 topics — not 10+ by splitting the worked example into sub-parts like "Step 1", "Step 2", "Step 3".

Rules:
- One worked example = exactly one topic. The same example is the anchor: from when the lecturer introduces it until they move on (e.g. to a new section or a break), it is ONE topic. Do not create separate topics for sub-parts of the same example.
- Only start a new topic when the lecturer clearly starts a different section, a different example, or a new theme.
- Output one short label per line, in chronological order. No timestamps. No numbering or bullets.
- Typical count: roughly 4–8 topics for 1 hour, 6–15 for 2 hours. If you have more than 8 topics for a 1-hour lecture, merge: combine all sub-parts of the same worked example into one topic."""

TOPIC_EXTRACTION_CHUNK = """You are given one segment of a longer lecture transcript. List the MAJOR topics or worked examples that appear in this segment only, in order.

Rules:
- One topic = one top-level section. Do NOT split one worked example into multiple topics; if the segment develops a single example (e.g. building one program or algorithm step by step), output one topic for that example.
- Output one short label per line, in order. No timestamps. No numbering or bullets.
- Include only topics that are clearly started or developed in this segment. When in doubt, prefer fewer topics per segment."""

TOPIC_MERGE = """You are given topic lists from consecutive segments of one lecture. Each line is "Segment N: topic1, topic2, ...".

Produce a single ordered list of major topics for the whole lecture: one short label per line, in chronological order. Deduplicate: if the same topic or the same worked example appears in multiple segments under different names (e.g. "Step 1 of X", "Step 2 of X", "Completing X"), merge them into one topic. Do not split one continuous example into multiple topics. Preserve order. No timestamps, no numbering."""

# ---- Boundary detection (Stage 2) ----

BOUNDARY_PROMPT_MAJOR_SECTION = """You are given a timestamped lecture transcript. Your task is to list the timestamps where the lecturer starts a NEW MAJOR SECTION only.

A major section is a big topic that would be its own top-level heading in lecture notes (e.g. "Introduction to X", "Implementing Y", "Syntax of Z", "Program structure"). Do NOT list timestamps for:
- Sub-topics or sub-headings that belong under the current major section (e.g. "syntactic sugar" under "syntax", "operators" under "syntax")
- Examples, Q&A, or brief asides unless they clearly start a new major theme
- Minor transitions or "so now we'll look at X" when X is still part of the same big topic

Do not start a new section in the middle of a single worked example or extended explanation. If the lecturer is still developing the same example (e.g. defining one concept step by step, or building one program), that is ONE section until they clearly move to a different topic or example. Rhetorical phrases like "What else do we need?" or "So the next requirement is..." usually do NOT start a new major section when they are part of the same example.

Guidance: a major section typically lasts several minutes (e.g. 5–20+). For a 1-hour lecture expect roughly 4–8 major sections; for 2 hours roughly 6–15. When in doubt, prefer fewer boundaries so that related content stays in one section.

Output ONLY the timestamps where a major section begins, one per line, in chronological order. Use the exact same format as in the transcript: M:SS for times under one hour, H:MM:SS for one hour or more. Do not include any other text or explanation."""

# ---- Boundary detection when transcript has NO timestamps (line-number based) ----

BOUNDARY_PROMPT_LINE_NUMBERS = """You are given a lecture transcript with line numbers. Your task is to list the line numbers where the lecturer starts a NEW MAJOR SECTION only.

A major section is a big topic that would be its own top-level heading in lecture notes. Do NOT list line numbers for sub-topics, examples, or minor transitions. Do not start a new section in the middle of a single worked example.

Output ONLY the line numbers (integers), one per line, in ascending order. No other text or explanation. Example:
3
12
25
"""

# ---- Stage 3: Transcript to notes ----

TRANSCRIPT_TO_NOTES = """You are given a raw lecture transcript segment (speech-to-text style). Your task is to turn it into comprehensive study notes.

Main job: Produce organized, cohesive study notes that capture and clarify what the professor teaches. You may flesh out examples and explain concepts in a clear, teaching-oriented way — the goal is notes that help someone study, not a verbatim summary. Use headings, lists, and code blocks as appropriate.

Output only valid markdown. No meta-commentary (e.g. no "Here are the notes:" or "Summary:"). Start directly with the notes content."""

def boundary_prompt_line_numbers_with_topics(topic_list: list[str]) -> str:
    """Build line-number boundary prompt when we have topics but no timestamps."""
    topics_text = "\n".join(f"- {t}" for t in topic_list)
    return f"""The lecture covers the following major topics, in order:

{topics_text}

Your task: list the line number at which the lecturer STARTS each of these topics. Output one line number per topic, in the same order as above. Use only these topics.

Output ONLY the line numbers (integers), one per line, in ascending order. No other text or explanation."""


def boundary_prompt_with_topics(topic_list: list[str]) -> str:
    """Build boundary prompt when we have a pre-extracted topic list."""
    topics_text = "\n".join(f"- {t}" for t in topic_list)
    return f"""The lecture covers the following major topics, in order:

{topics_text}

Your task: list the timestamp at which the lecturer STARTS each of these topics. Output one timestamp per topic, in the same order as above. Use only these topics; do not add extra boundaries. Do not split inside a topic (e.g. do not put a boundary in the middle of one worked example).

Output ONLY the timestamps, one per line, in chronological order. Use the exact same format as in the transcript: M:SS for times under one hour, H:MM:SS for one hour or more. Do not include any other text or explanation."""
