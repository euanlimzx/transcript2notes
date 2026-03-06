/** Proxies GET /api/conversions/:id/queue-position to the Python backend. */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 5_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND}/api/conversions/${id}/queue-position`, {
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
      { detail: e instanceof Error ? e.message : "Queue position failed." },
      { status: 502 }
    );
  }
}
