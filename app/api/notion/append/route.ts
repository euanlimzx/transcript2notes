import { createClient } from "@/lib/supabase/server";
import { appendBullet } from "@/lib/notion";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ detail: "text is required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("notion_connections")
    .select("notion_token, default_page_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    return Response.json({ detail: "Notion not connected" }, { status: 400 });
  }
  if (!data.default_page_id) {
    return Response.json({ detail: "No Notion page selected" }, { status: 400 });
  }
  try {
    await appendBullet(data.notion_token, data.default_page_id, text);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Append failed";
    return Response.json({ detail: message }, { status: 502 });
  }
}
