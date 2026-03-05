export type Conversion = {
  id: string;
  status: "pending" | "completed" | "failed";
  markdown: string | null;
  error: string | null;
  progress: string | null;
  created_at: string;
};

export function progressLabel(progress: string | null): string {
  if (!progress) return "Converting…";
  if (progress === "parsing") return "Parsing transcript…";
  if (progress === "extracting_topics") return "Extracting topics…";
  if (progress === "segmenting") return "Segmenting transcript…";
  const m = progress.match(/^generating_notes \((\d+\/\d+)\)$/);
  if (m) return `Generating notes ${m[1]}…`;
  return progress;
}

export function splitMarkdownSections(markdown: string): string[] {
  return markdown.split(/\n(?=## )/).filter(Boolean);
}

export function formatSidebarTitle(c: Conversion): string {
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
