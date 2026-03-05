"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/lib/supabase";
import {
  type Conversion,
  progressLabel,
  splitMarkdownSections,
} from "@/lib/conversions";

export default function NotesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const fetchConversion = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversions")
      .select("id, status, markdown, error, progress, created_at")
      .eq("id", id)
      .single();
    if (error || !data) {
      setNotFound(true);
      return null;
    }
    const c = data as Conversion;
    setConversion(c);
    return c;
  }, [id]);

  useEffect(() => {
    fetchConversion();
  }, [fetchConversion]);

  // Poll when pending
  useEffect(() => {
    if (!conversion || conversion.status !== "pending") return;

    const HEALTH_INTERVAL_MS = 30_000;
    const hasProgress = !!conversion.progress;
    const REFRESH_INTERVAL_MS = hasProgress ? 5_000 : 15_000;

    let healthTimer: number | undefined;
    let refreshTimer: number | undefined;

    const pingHealth = async () => {
      try {
        await fetch("/api/health", { cache: "no-store" });
      } catch {
        /* ignore */
      }
    };

    const refresh = async () => {
      const updated = await fetchConversion();
      if (updated?.status === "completed" || updated?.status === "failed") {
        setConversion(updated);
      }
    };

    pingHealth();
    refresh();

    healthTimer = window.setInterval(pingHealth, HEALTH_INTERVAL_MS);
    refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      if (healthTimer !== undefined) window.clearInterval(healthTimer);
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
    };
  }, [conversion?.id, conversion?.status, conversion?.progress, fetchConversion]);

  async function handleRerun() {
    if (!id) return;
    setRerunError(null);
    setRerunLoading(true);
    try {
      const res = await fetch("/api/convert/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRerunError(data.detail ?? "Re-run failed.");
        return;
      }
      const jobId = data.jobId as string | undefined;
      if (jobId) {
        router.replace(`/notes/${jobId}`);
      }
    } catch (e) {
      setRerunError(e instanceof Error ? e.message : "Re-run failed.");
    } finally {
      setRerunLoading(false);
    }
  }

  async function copySection(section: string) {
    try {
      await navigator.clipboard.writeText(section);
    } catch {
      /* ignore */
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-zinc-500 dark:text-zinc-400">Conversion not found.</p>
      </div>
    );
  }

  if (!conversion) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (conversion.status === "pending") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium">
              {progressLabel(conversion.progress)}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Do not close this tab. Notes will appear when ready.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (conversion.status === "failed") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        {conversion.error && (
          <p
            className="text-sm text-red-600 dark:text-red-400 mb-4"
            role="alert"
          >
            {conversion.error}
          </p>
        )}
        <button
          type="button"
          onClick={handleRerun}
          disabled={rerunLoading}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {rerunLoading ? "Attempting…" : "Attempt converting to notes again"}
        </button>
        {rerunError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {rerunError}
          </p>
        )}
      </div>
    );
  }

  // Completed
  const sections = conversion.markdown
    ? splitMarkdownSections(conversion.markdown)
    : [];

  if (sections.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-zinc-500 dark:text-zinc-400">No notes content.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="space-y-6">
        {sections.map((section, i) => (
          <section
            key={i}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
          >
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => copySection(section)}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Copy section
              </button>
            </div>
            <div className="prose prose-zinc dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {section}
              </ReactMarkdown>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
