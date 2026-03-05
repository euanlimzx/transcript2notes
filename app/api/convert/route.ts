/** Proxies POST /api/convert to the Python backend. Requires auth; passes user_id for tracking. */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 15_000;

import { createClient } from "@/lib/supabase/server";

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
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    return Response.json(
      { detail: e instanceof Error ? e.message : "Conversion failed." },
      { status: 502 }
    );
  }
}
