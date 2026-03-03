# Transcript to Notes

Pipeline: parse transcript (Stage 1), detect topic boundaries (Stage 2), then turn each segment into markdown study notes (Stage 3). Deploy as separate frontend (Vercel) and backend (your server); see [DEPLOY.md](DEPLOY.md).

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

## Deploy

**Separate deployments:** Next.js on Vercel, FastAPI on your own server (e.g. Render). Set `BACKEND_URL` on Vercel to your backend URL. Full steps and env vars: [DEPLOY.md](DEPLOY.md).

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
