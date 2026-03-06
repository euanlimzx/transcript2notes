export type Conversion = {
  id: string;
  status: "pending" | "completed" | "failed";
  markdown: string | null;
  error: string | null;
  progress: string | null;
  name: string | null;
  created_at: string;
};

export function progressLabel(progress: string | null): string {
  if (!progress) return "Converting…";

  // Known pipeline stages (backend emits these exact strings)
  if (progress === "parsing") return "Parsing transcript…";
  if (progress === "extracting_topics") return "Extracting topics…";
  if (progress === "segmenting") return "Segmenting transcript…";
  if (progress === "generating_notes") return "Generating notes…";

  // Per-segment progress in Stage 3: "generating_notes (2/5)"
  const m = progress.match(/^generating_notes \((\d+\/\d+)\)$/);
  if (m) return `Generating notes ${m[1]}…`;

  // Fallback: avoid leaking internal snake_case; show a generic label instead.
  return "Converting…";
}

export function splitMarkdownSections(markdown: string): string[] {
  return markdown.split(/\n(?=## )/).filter(Boolean);
}

export function formatSidebarTitle(c: Conversion): string {
  if (c.name && c.name.trim().length > 0) {
    return c.name.trim();
  }

  const d = new Date(c.created_at);
  const date = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}
