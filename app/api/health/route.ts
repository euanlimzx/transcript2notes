/** Proxies GET /api/health to the Python backend (used to pre-warm cold starts). */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 8_000;

import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    clearTimeout(timeoutId);
    if (res.status >= 500) {
      console.error("[api/health] Backend error:", res.status, data);
      return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
    }
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("[api/health] Proxy error:", e);
    return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }
}

