/** Proxies DELETE /api/conversions/:id to the Python backend. Backend returns 204 on success. */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 5_000;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND}/api/conversions/${id}`, {
      method: "DELETE",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.status === 204) {
      return new Response(null, { status: 204 });
    }
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    return Response.json(
      { detail: e instanceof Error ? e.message : "Delete failed." },
      { status: 502 }
    );
  }
}
