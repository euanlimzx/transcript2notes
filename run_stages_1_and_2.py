#!/usr/bin/env python3
"""Run Stage 1 (parse + slice), topic extraction, and Stage 2 (LLM boundaries + segments), write segments to JSON."""
import argparse
import json
import logging
from pathlib import Path

from dotenv import load_dotenv

from src.stage1_parse import run_stage1
from src.topic_extraction import extract_topics
from src.stage2_boundaries import run_stage2
from src.models import Segment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def segment_to_dict(s: Segment) -> dict:
    return {
        "start_sec": s.start_sec,
        "end_sec": s.end_sec,
        "start_ts": s.start_ts,
        "end_ts": s.end_ts,
        "text": s.text,
    }


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Run Stage 1 and 2 of transcript pipeline")
    parser.add_argument(
        "input",
        nargs="?",
        default="input.txt",
        help="Path to timestamped transcript (default: input.txt)",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="segments.json",
        help="Output JSON path for segments (default: segments.json)",
    )
    parser.add_argument(
        "--model",
        default="gpt-4o-mini",
        help="OpenAI model for boundary detection and topic extraction (default: gpt-4o-mini)",
    )
    parser.add_argument(
        "--no-topics",
        action="store_true",
        help="Skip topic extraction; run boundary detection with fallback prompt only",
    )
    parser.add_argument(
        "--write-topics",
        action="store_true",
        help="Write extracted topics to a JSON file next to the output (e.g. segments_topics.json)",
    )
    args = parser.parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.is_file():
        logger.error("Input file not found: %s", input_path)
        raise SystemExit(1)

    logger.info("Stage 1: parsing %s", input_path)
    lines, slices = run_stage1(input_path)
    logger.info("Parsed %d lines, %d slice(s) for LLM", len(lines), len(slices))

    topics = None
    if not args.no_topics:
        logger.info("Topic extraction (model=%s)", args.model)
        raw_topics = extract_topics(lines, model=args.model)
        if raw_topics:
            topics = raw_topics
        logger.info("Extracted %d topics", len(topics) if topics else 0)
        if args.write_topics and raw_topics:
            topics_path = output_path.parent / (
                output_path.stem + "_topics.json"
            )
            topics_path.write_text(
                json.dumps(raw_topics, indent=2), encoding="utf-8"
            )
            logger.info("Wrote %s", topics_path)

    logger.info("Stage 2: boundary detection (model=%s)", args.model)
    segments = run_stage2(
        lines, slices, model=args.model, topics=topics
    )
    logger.info("Built %d segments", len(segments))

    out_data = [segment_to_dict(s) for s in segments]
    output_path.write_text(json.dumps(out_data, indent=2), encoding="utf-8")
    logger.info("Wrote %s", output_path)


if __name__ == "__main__":
    main()
