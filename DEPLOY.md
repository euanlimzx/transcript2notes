# Deployment: Vercel (frontend) + your server (FastAPI backend)

The app uses **separate deployments**: Next.js on Vercel and the FastAPI backend on your own server (e.g. Render, Railway). The frontend proxies `/api/convert` and `/api/conversions/:id` to the backend.

## 1. Vercel (frontend)

- Deploy the repo as a Vercel project (Next.js is auto-detected).
- **Environment variable (required for production):**
  - `BACKEND_URL` — base URL of your FastAPI backend, no trailing slash (e.g. `https://your-app.onrender.com`).
- Other env vars the frontend needs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (for the client to list conversions).

Without `BACKEND_URL` in production, the proxy routes fall back to `http://127.0.0.1:5328` and will fail. Set it to your deployed backend URL.

## 2. Backend (FastAPI on your server)

Deploy the same repo (or the backend parts) to Render, Railway, or any host that runs Python.

- **Build:** install dependencies, e.g.  
  `pip install -r requirements.txt`
- **Start:**  
  `uvicorn api:app --host 0.0.0.0 --port $PORT`  
  (Render and similar set `PORT`; for local use e.g. `--port 5328`.)

**Environment variables on the backend:**

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`

Optional: `CORS_ORIGINS` (only needed if the browser will call the API directly; with the proxy setup you don’t need it).

**Health check (optional):** Add a `GET /` or `GET /health` in [api.py](api.py) and set that path as the health check in your host so the service stays up.

## 3. Local development

No `BACKEND_URL` needed. The proxy defaults to `http://127.0.0.1:5328`.

1. Start the backend: `npm run dev:api` (or `uvicorn api:app --reload --port 5328`).
2. Start the frontend: `npm run dev`.
3. Open http://localhost:3000.

The app calls `/api/convert` and `/api/conversions/:id`; Next.js proxies them to the local FastAPI server.
