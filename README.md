# Transcript to Notes

Pipeline: parse transcript (Stage 1), detect topic boundaries via OpenAI (Stage 2), then turn each segment into markdown study notes (Stage 3). Outputs segments JSON and `output.md`.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.

## Run

```bash
python run_pipeline.py [input.txt] -o segments.json
```

- **Input:** path to transcript (default: `input.txt`).
- **Outputs:** `segments.json` (default) — list of `{start_sec, end_sec, start_ts, end_ts, text}`; `output.md` — markdown study notes (Stage 3). Use `--skip-notes` to skip notes; `--notes-output path.md` to change notes path.

Optional: `--model gpt-4o-mini` (default) or `gpt-4o`.

## Permissions / allowlist

- **Network:** required for `pip install` and for the script (OpenAI API calls).
- **Filesystem:** read input file, write `segments.json` and `output.md` (and `.venv` if you create it in-project).

## API + frontend

Run the FastAPI backend (from repo root):

```bash
uvicorn api:app --reload
```

Run the Next.js frontend:

```bash
cd frontend && npm install && npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the API is not at `http://localhost:8000`. Paste a transcript, click Convert, and copy sections from the rendered notes.

## Validate Stage 1 only (no API)

```bash
python3 -c "from src.stage1_parse import run_stage1; lines, slices = run_stage1('input.txt'); print('lines=%d slices=%d' % (len(lines), len(slices)))"
```
