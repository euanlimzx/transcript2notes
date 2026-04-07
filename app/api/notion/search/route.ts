import { createClient } from "@/lib/supabase/server";
import { searchPages } from "@/lib/notion";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const { data, error } = await supabase
    .from("notion_connections")
    .select("notion_token")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    return Response.json({ detail: "Notion not connected" }, { status: 400 });
  }
  try {
    const pages = await searchPages(data.notion_token, q);
    return Response.json({ pages });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return Response.json({ detail: message }, { status: 502 });
  }
}
