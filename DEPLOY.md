# Deployment: Vercel (frontend) + your server (FastAPI backend)

The app uses **separate deployments**: Next.js on Vercel and the FastAPI backend on your own server (e.g. Render, Railway). The frontend proxies `/api/convert` and `/api/conversions/:id` to the backend.

## 0. Supabase Auth and database migration

- **Auth:** Users sign in via magic link; only **.edu** email addresses are accepted (simple suffix check).
- **Supabase Dashboard:** Enable **Email** auth and configure **Site URL** and **Redirect URLs** under Authentication → URL Configuration. Add:
  - `http://localhost:3000/auth/callback` (local)
  - `https://your-app.vercel.app/auth/callback` (production)
- **Run migrations:** Apply in order: `002_add_user_id_to_conversions.sql`, `003_transcript_and_progress.sql`, `004_priority_queue.sql` (adds `priority_users` table and `is_priority` on conversions).

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

**Health check (recommended on Render):** The backend includes `GET /health` (and `GET /api/health`). Use `/health` as the Render health check, and the frontend has `/api/health` for a “Wake server” button.

### Inngest (job queue)

The pipeline runs via Inngest for durability and retries. Set up Inngest as follows.

**1. Install Python package** — Already in `requirements.txt` (`inngest-py`). Run `pip install -r requirements.txt`.

**2. Create an Inngest account** — Sign up at [app.inngest.com](https://app.inngest.com).

**3. Local development**

- Start the Inngest Dev Server (in a separate terminal):
  ```bash
  npx inngest-cli@latest dev
  ```
- Set `INNGEST_DEV=1` when running your backend (or add to `.env`).
- No signing or event keys needed locally.

**4. Production (Render, etc.)**

- **Do not set `INNGEST_DEV`** in production. If it's set to `1`, Inngest stays in dev mode even with signing keys.
- In the [Inngest Dashboard](https://app.inngest.com) → your app → **Manage** → **Keys**:
  - Copy **Signing key** and set `INNGEST_SIGNING_KEY` on your backend.
  - Copy **Event key** and set `INNGEST_EVENT_KEY` on your backend (for sending events).
- **Sync your app:** In the Inngest Dashboard → **Apps** → **Sync App** (or **Sync New App**). Enter your backend URL:
  ```
  https://your-app.onrender.com/api/inngest
  ```
  Inngest will discover your functions from this endpoint.
- Optional: `INNGEST_APP_ID` (default: `transcript2notes`).

**5. Verify** — After syncing, your `process-conversion-next` function should appear in the Inngest dashboard. You can trigger a test event or submit a transcript to confirm it runs.

## 3. Local development

No `BACKEND_URL` needed. The proxy defaults to `http://127.0.0.1:5328`.

1. **Inngest Dev Server** (for job processing): `npx inngest-cli@latest dev`
2. **Backend:** `npm run dev:api` (or `uvicorn api:app --reload --port 5328`). Set `INNGEST_DEV=1` in `.env` or your shell.
3. **Frontend:** `npm run dev`
4. Open http://localhost:3000.

The app calls `/api/convert` (proxied to backend); conversions are listed and deleted via Supabase (RLS enforces per-user access).
