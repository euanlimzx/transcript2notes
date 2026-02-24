# Transcript to Notes

Pipeline: parse transcript (Stage 1), detect topic boundaries (Stage 2), then turn each segment into markdown study notes (Stage 3). Single deployment: Next.js app and Python API run from the same repo root; one Vercel project serves both.

## Quick Start (One Command)

**Install dependencies and start both servers:**

```bash
./start.sh
```

Or using npm:

```bash
npm run setup
```

This will:
- Create Python virtual environment (if needed)
- Install Python dependencies
- Install Node dependencies
- Start both Next.js (port 3000) and Python API (port 5328)

Open http://localhost:3000 when ready.

## Manual Setup

**Python (backend / pipeline)**

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (used by the pipeline and API).

**Node (frontend)**

```bash
npm install
```

## Run locally

**Option A: One command (recommended)**

```bash
npm run dev:all
```

Starts both Next.js and Python API with colored output.

**Option B: Two terminals**

1. Start the Python API (port 5328):

   ```bash
   npm run dev:api
   # or: uvicorn api:app --reload --port 5328
   ```

2. Start Next.js (port 3000):

   ```bash
   npm run dev
   ```

Open http://localhost:3000. The app calls `/api/convert`; Next.js rewrites that to the Python server on 5328 in development.

**Option C: Vercel CLI (closer to production)**

```bash
vercel dev
```

Runs both Next.js and the Python API under one process.

## Deploy (Vercel)

One deployment serves both the Next.js app and the Python API:

- **Root:** Next.js (`app/`, `next.config.ts`, `package.json`) and Python (`api/`, `src/`, `requirements.txt`).
- **API:** `api/index.py` is the serverless FastAPI entry; all `/api/*` requests are handled by it (see `vercel.json`).

1. Push to GitHub and import the repo as a Vercel project (or use the Vercel CLI).
2. Set **Environment Variables** in the Vercel project: `GEMINI_API_KEY` (and optionally `CORS_ORIGINS`).
3. **Function timeout:** The pipeline can run 60s+ for long transcripts. In Vercel, `api/index.py` is set to `maxDuration: 300` in `vercel.json` (Pro/Enterprise; Hobby is limited to 60s). If you hit timeouts, consider upgrading or chunking in a future iteration.

No need to set `NEXT_PUBLIC_API_URL` for production; the app uses relative `/api/convert`.

## CLI pipeline (no server)

```bash
python run_pipeline.py [input.txt] -o segments.json
```

- **Input:** path to transcript (default: `input.txt`).
- **Outputs:** `segments.json` (default) and `output.md` (markdown notes). Use `--skip-notes` to skip notes; `--notes-output path.md` to change notes path.

## Validate Stage 1 only (no API)

```bash
python3 -c "from src.stage1_parse import run_stage1; lines, slices = run_stage1('input.txt'); print('lines=%d slices=%d' % (len(lines), len(slices)))"
```
