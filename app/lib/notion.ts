// Thin Notion API helpers. All calls run server-side so the user's
// integration token never reaches the browser.

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

type NotionFetchInit = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

async function notionFetch(token: string, path: string, init: NotionFetchInit = {}) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : null) ?? `Notion API error (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    await notionFetch(token, "/users/me");
    return true;
  } catch {
    return false;
  }
}

export type NotionPage = { id: string; title: string };

type NotionSearchResult = {
  results?: Array<{
    id: string;
    object: string;
    properties?: Record<
      string,
      { type?: string; title?: Array<{ plain_text?: string }> }
    >;
  }>;
};

type NotionSearchPageResult = NonNullable<NotionSearchResult["results"]>[number];

function extractPageTitle(page: NotionSearchPageResult): string {
  const props = page.properties ?? {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title.map((t) => t.plain_text ?? "").join("").trim();
      if (text) return text;
    }
  }
  return "Untitled";
}

export async function searchPages(token: string, query: string): Promise<NotionPage[]> {
  const data = (await notionFetch(token, "/search", {
    method: "POST",
    body: {
      query,
      filter: { property: "object", value: "page" },
      page_size: 20,
    },
  })) as NotionSearchResult;
  return (data.results ?? [])
    .filter((r) => r.object === "page")
    .map((r) => ({ id: r.id, title: extractPageTitle(r) }));
}

export async function appendBullet(token: string, pageId: string, text: string): Promise<void> {
  // Notion rich_text content has a 2000 char limit per chunk.
  const chunks: string[] = [];
  const MAX = 2000;
  for (let i = 0; i < text.length; i += MAX) {
    chunks.push(text.slice(i, i + MAX));
  }
  await notionFetch(token, `/blocks/${pageId}/children`, {
    method: "PATCH",
    body: {
      children: [
        {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: chunks.map((content) => ({
              type: "text",
              text: { content },
            })),
          },
        },
      ],
    },
  });
}
