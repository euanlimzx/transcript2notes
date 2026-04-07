import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  const pageTitle = typeof body.pageTitle === "string" ? body.pageTitle : null;
  if (!pageId) {
    return Response.json({ detail: "pageId is required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("notion_connections")
    .update({
      default_page_id: pageId,
      default_page_title: pageTitle,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (error) {
    return Response.json({ detail: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
