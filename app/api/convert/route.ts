/** Proxies POST /api/convert to the Python backend. Backend returns 202 + jobId immediately; conversion runs in background. */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 15_000; // 15 s — we only wait for insert + job id

export async function POST(request: Request) {
  const body = await request.json();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    clearTimeout(timeoutId);
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    return Response.json(
      { detail: e instanceof Error ? e.message : "Conversion failed." },
      { status: 502 }
    );
  }
}
