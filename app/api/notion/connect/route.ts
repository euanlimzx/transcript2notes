import { createClient } from "@/lib/supabase/server";
import { validateToken } from "@/lib/notion";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const { data } = await supabase
    .from("notion_connections")
    .select("default_page_id, default_page_title")
    .eq("user_id", user.id)
    .maybeSingle();
  return Response.json({
    connected: !!data,
    defaultPageId: data?.default_page_id ?? null,
    defaultPageTitle: data?.default_page_title ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return Response.json({ detail: "Token is required" }, { status: 400 });
  }
  const ok = await validateToken(token);
  if (!ok) {
    return Response.json(
      { detail: "Token rejected by Notion. Double-check and try again." },
      { status: 400 }
    );
  }
  const { error } = await supabase
    .from("notion_connections")
    .upsert(
      {
        user_id: user.id,
        notion_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) {
    return Response.json({ detail: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const { error } = await supabase
    .from("notion_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    return Response.json({ detail: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
