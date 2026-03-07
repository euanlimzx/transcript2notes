/** Proxies POST /api/convert to the Python backend. Requires auth; passes user_id for tracking. */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 15_000;

import { createClient } from "@/lib/supabase/server";
import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ detail: "Unauthorized. Please sign in." }, { status: 401 });
  }

  const body = await request.json();
  const payload = {
    ...body,
    userId: user.id,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    clearTimeout(timeoutId);
    if (res.status >= 500) {
      console.error("[api/convert] Backend error:", res.status, data);
      return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
    }
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("[api/convert] Proxy error:", e);
    return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }
}
