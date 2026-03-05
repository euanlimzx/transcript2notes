"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/lib/supabase";
import { type Conversion, progressLabel } from "@/lib/conversions";
import { LoadingBlock } from "@/components/LoadingBlock";

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

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-zinc-500 dark:text-zinc-400">Conversion not found.</p>
      </div>
    );
  }

  if (!conversion) {
    return <LoadingBlock />;
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
  if (!conversion.markdown?.trim()) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-zinc-500 dark:text-zinc-400">No notes content.</p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-3xl px-12 pt-36 pb-16 leading-relaxed"
    >
      <article className="prose prose-lg prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:my-4 prose-p:leading-8 prose-p:text-[1.125rem] prose-ul:my-4 prose-ol:my-4 prose-li:my-0.5 prose-li:text-[1.125rem] prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800/50 prose-pre:rounded-md prose-pre:px-4 prose-pre:py-3 prose-pre:text-base prose-blockquote:border-l-zinc-300 dark:prose-blockquote:border-l-zinc-600 prose-blockquote:not-italic prose-blockquote:text-[1.125rem]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {conversion.markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
