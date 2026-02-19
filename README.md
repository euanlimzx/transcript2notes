# Transcript to Notes — Stage 1 & 2

Pipeline: parse timestamped transcript (Stage 1) and detect topic boundaries via OpenAI (Stage 2), then write segments to JSON.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.

## Run

```bash
python run_stages_1_and_2.py [input.txt] -o segments.json
```

- **Input:** path to transcript (default: `input.txt`).
- **Output:** `segments.json` (default) — list of `{start_sec, end_sec, start_ts, end_ts, text}`.

Optional: `--model gpt-4o-mini` (default) or `gpt-4o`.

## Permissions / allowlist

- **Network:** required for `pip install` and for the script (OpenAI API calls).
- **Filesystem:** read input file, write `segments.json` (and `.venv` if you create it in-project).

## Validate Stage 1 only (no API)

```bash
python3 -c "from src.stage1_parse import run_stage1; lines, slices = run_stage1('input.txt'); print('lines=%d slices=%d' % (len(lines), len(slices)))"
```
