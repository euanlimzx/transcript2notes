/** Proxies GET /api/health to the Python backend (used to pre-warm cold starts). */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 8_000;

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
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    return Response.json(
      { detail: e instanceof Error ? e.message : "Health check failed." },
      { status: 502 }
    );
  }
}

