/** Proxies GET /api/conversions/:id/queue-position to the Python backend. Requires auth; backend verifies ownership. */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 5_000;

import { createClient } from "@/lib/supabase/server";
import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ detail: "Unauthorized. Please sign in." }, { status: 401 });
  }

  const { id } = await params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const url = new URL(`${BACKEND}/api/conversions/${id}/queue-position`);
    url.searchParams.set("userId", user.id);
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    clearTimeout(timeoutId);
    if (res.status >= 500) {
      console.error("[api/conversions/queue-position] Backend error:", res.status, data);
      return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
    }
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("[api/conversions/queue-position] Proxy error:", e);
    return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }
}
