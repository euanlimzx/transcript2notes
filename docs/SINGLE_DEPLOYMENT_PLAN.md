# Plan: Single deployment (Next.js + Python on Vercel)

The [Vercel article](https://vercel.com/kb/guide/how-to-use-python-and-javascript-in-the-same-application) does teach **single deployment**: one Vercel project where the Next.js app and the Python API live in the same repo root. Locally you run both (Next + Python); in production, `/api/*` is served by **Python serverless functions** on Vercel—no separate backend server.

This plan restructures the repo so one `vercel deploy` (or Git push) builds and deploys both the frontend and the transcript→notes API.

---

## Current layout

- **Frontend:** `frontend/` (Next.js 16, App Router: `frontend/src/app/`)
- **Backend:** root `api.py` (FastAPI, `POST /convert`) + `src/` (pipeline: stage1, stage2, stage3, LLM)
- **Run today:** two processes: `uvicorn api:app --reload` (port 8000) and `cd frontend && npm run dev` (port 3000)

---

## Target layout (single root for Vercel)

Vercel expects one project root that contains both the Next.js app and the `api/` folder. The [nextjs-flask template](https://github.com/vercel/examples/tree/main/python/nextjs-flask) looks like:

- Next.js (app/, next.config.js, package.json) and **api/** (Python) in the **same directory**.

So we need:

- **Repo root** = Vercel project root.
- **Next.js** at root: `app/`, `next.config.ts`, `package.json`, `tsconfig.json`, etc. (moved from `frontend/`).
- **Python API** at root: `api/` (serverless entry) + existing `src/` (pipeline). No name clash if we use `app/` for Next (App Router) and keep `src/` for Python.

Resulting structure:

```
transcript2notes/
├── app/                    # Next.js App Router (from frontend/src/app)
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── api/
│   └── index.py            # FastAPI app (single serverless function)
├── src/                    # Python pipeline (unchanged)
│   ├── pipeline.py
│   ├── stage1_parse.py
│   ├── stage2_boundaries.py
│   ├── stage3_notes.py
│   ├── topic_extraction.py
│   ├── llm_client.py
│   ├── models.py
│   └── prompts_config.py
├── public/                 # optional, from frontend if present
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── tailwind.config.ts
├── requirements.txt
├── vercel.json
├── api.py                   # optional: keep for local uvicorn or remove
├── run_pipeline.py
├── .env
└── ...
```

---

## Implementation steps

### 1. Move Next.js to repo root

- Create root `app/` and move `frontend/src/app/*` into it (`layout.tsx`, `page.tsx`, `globals.css`).
- Copy (or move) from `frontend/` to root: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `.env.example` (e.g. as `frontend/.env.example` → root `.env.example` or merge into existing).
- Add/update root `package.json` scripts so `npm run dev` runs Next.js; optionally add a script that runs both Next and the Python API (e.g. `concurrently "next dev" "uvicorn api:app --reload"` or run the Python API from `api/index.py` on a fixed port for dev).
- Remove or repurpose `frontend/` (e.g. delete after move, or leave a short README pointing to root).

Imports and paths in the Next app stay the same relative to the new `app/` directory; only the repo path changes.

### 2. Add `api/` as the serverless FastAPI entry

- Create `api/index.py` that:
  - Defines a FastAPI `app` (Vercel looks for `app` in `api/index.py`).
  - Imports `run_pipeline` from the existing pipeline. Use a path that works when the project root is the working directory (e.g. `from src.pipeline import run_pipeline`). Ensure `src` is on the module path (repo root is the project root for Vercel Python).
  - Exposes **`POST /api/convert`** (same as current contract). In production, Vercel will send requests to `/api/convert`, so the route must be `/api/convert`, not `/convert`.
  - Keeps the same request/response shape: body `{ transcript: string }`, response `{ markdown: string }`, and same error handling (400/500).
- Ensure `api/index.py` and `src/` are both included in the Vercel build. Vercel bundles the project; imports from `src` in `api/index.py` should pull in `src/`. If the build runs from a subdirectory, you may need to keep the Python code at repo root (no Root Directory override, or Root Directory = repo root).

Optional: keep root `api.py` for local dev with `uvicorn api:app --reload` and have it delegate to the same pipeline, or run the FastAPI app from `api/index.py` on a fixed port (e.g. 5328) in dev so one config works for both local and prod.

### 3. Next.js rewrites (same as the article)

In `next.config.ts`:

- **Development:** rewrite `/api/:path*` → `http://127.0.0.1:5328/api/:path*` (or the port where you run the FastAPI app locally).
- **Production:** rewrite `/api/:path*` → `/api/` so that the request is handled by Vercel’s Python serverless (no external URL). Same pattern as the [nextjs-flask example](https://github.com/vercel/examples/blob/main/python/nextjs-flask/blob/main/next.config.js).

Example:

```ts
// next.config.ts
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination:
          process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:5328/api/:path*'
            : '/api/',
      },
    ];
  },
};
```

Use 5328 only if you run the Python API on that port in dev (e.g. via a script in `package.json`). If you keep using port 8000 for uvicorn, use `http://127.0.0.1:8000/api/:path*` instead.

### 4. Route all `/api/*` to the single Python function (Vercel)

By default, Vercel maps `/api/foo` to `api/foo.py`. To send **all** `/api/*` traffic to one FastAPI app (one serverless function), use a catch-all in `vercel.json`:

```json
{
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index" }
  ]
}
```

Confirm in [Vercel docs](https://vercel.com/docs/functions/configuring-functions) the exact `dest` format (e.g. `/api/index` or `api/index.py`). This way a single FastAPI app in `api/index.py` handles `/api/convert` and any future routes.

### 5. Frontend API URL

- In the Next app (e.g. `app/page.tsx`), call the API with a **relative** URL so it works in both dev and prod:
  - `fetch('/api/convert', { method: 'POST', ... })`.
- Remove or make optional `NEXT_PUBLIC_API_URL` for production; keep it only if you need to point to an external backend (e.g. staging).

### 6. Dependencies and env

- **Python:** Keep `requirements.txt` at repo root with current deps (fastapi, uvicorn, google-genai, python-dotenv, etc.). Vercel will install them for the `api/` serverless functions.
- **Env:** Set `GEMINI_API_KEY` (or whatever the pipeline uses) in the Vercel project’s Environment Variables. No need to change how the pipeline loads env (e.g. `os.getenv` / `dotenv`).

### 7. Function timeout (important)

The transcript→notes pipeline does several LLM calls and can take **more than 10–60 seconds** for long transcripts. Vercel limits:

- Hobby: up to 60 s (configurable up to 60 s).
- Pro/Enterprise: up to 300 s (5 min); with Fluid Compute, longer.

Configure the Python function’s max duration so it doesn’t 504. For Vercel Python, this is typically set in `vercel.json` under the function config, e.g.:

```json
{
  "functions": {
    "api/index.py": {
      "maxDuration": 300
    }
  }
}
```

Use the maximum your plan allows. If you hit timeouts often, consider Pro + Fluid or chunking/streaming in a later iteration.

### 8. Local development

- **Option A:** Run Next and Python separately: `npm run dev` (Next) and `uvicorn api:app --reload --port 5328` (or run the app from `api/index.py` on 5328). Rewrites then proxy `/api/*` to the Python server.
- **Option B:** Use `vercel dev` so that both Next and the Python API run under one process (closer to production). Then a single command can start the full stack.

Update README with the chosen flow and any port (5328 vs 8000).

### 9. Cleanup and docs

- Remove or archive the old `frontend/` directory after the move.
- Update README: single deployment, one Vercel project, how to run locally, env vars (including Vercel), and timeout note.
- Optional: add a “Deploy with Vercel” button and document that `api/` + `src/` are the Python backend and `app/` is the Next.js frontend.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Move Next.js from `frontend/` to repo root (`app/`, config files, package.json). |
| 2 | Add `api/index.py` with FastAPI app, route `POST /api/convert`, import from `src.pipeline`. |
| 3 | Add Next.js rewrites: dev → local Python URL, prod → `/api/`. |
| 4 | Add `vercel.json` routes so all `/api/*` go to `api/index`. |
| 5 | Frontend: use `fetch('/api/convert', ...)`. |
| 6 | Keep `requirements.txt` at root; set env (e.g. `GEMINI_API_KEY`) in Vercel. |
| 7 | Set `maxDuration` for `api/index.py` in `vercel.json` (e.g. 300). |
| 8 | Document local dev (two terminals or `vercel dev`). |
| 9 | Update README and remove obsolete `frontend/` references. |

After this, a single deployment on Vercel serves both the Next.js app and the Python API under one URL; the article’s pattern is fully applied with FastAPI instead of Flask.
