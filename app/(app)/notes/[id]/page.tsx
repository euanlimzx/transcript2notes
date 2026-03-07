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
  const [jobsBefore, setJobsBefore] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const fetchConversion = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversions")
      .select("id, status, markdown, error, progress, name, created_at")
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
        setJobsBefore(null);
      }
    };

    const fetchQueuePosition = async () => {
      try {
        const res = await fetch(`/api/conversions/${id}/queue-position`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setJobsBefore(
            typeof data.jobs_before === "number" ? data.jobs_before : null
          );
        } else {
          setJobsBefore(null);
        }
      } catch {
        setJobsBefore(null);
      }
    };

    pingHealth();
    refresh();
    fetchQueuePosition();

    const healthTimer = window.setInterval(pingHealth, HEALTH_INTERVAL_MS);
    const refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const queueTimer = window.setInterval(fetchQueuePosition, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(healthTimer);
      window.clearInterval(refreshTimer);
      window.clearInterval(queueTimer);
    };
  }, [conversion, fetchConversion, id]);

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
      <div className="flex flex-col items-center justify-start min-h-full w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 w-full max-w-[50%] text-left">
          Conversion not found.
        </p>
      </div>
    );
  }

  if (!conversion) {
    return <LoadingBlock />;
  }

  if (conversion.status === "pending") {
    return (
      <div className="flex flex-col items-center justify-start min-h-full w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <div className="flex items-start gap-2 w-full max-w-[50%]">
          <span
            className="inline-block w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse shrink-0 mt-1.5"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">
              {progressLabel(conversion.progress)}
            </p>
            <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
              {jobsBefore !== null
                ? jobsBefore === 0
                  ? "We're currently processing your transcript right now. We're expecting this to take a while, so feel free to check back in later for updates."
                  : `There are ${jobsBefore} job${jobsBefore === 1 ? "" : "s"} ahead of you in queue right now. We're expecting this to take a while, so feel free to check back in later for updates.`
                : "We're expecting this to take a while, so feel free to check back in later for updates."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (conversion.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-start min-h-full w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <div className="w-full max-w-[50%] flex flex-col items-start text-left">
          {conversion.error && (
            <p
              className="text-base font-medium text-red-600 dark:text-red-400 mb-4"
              role="alert"
            >
              {conversion.error}
            </p>
          )}
          <button
            type="button"
            onClick={handleRerun}
            disabled={rerunLoading}
            className="text-sm sm:text-base font-medium px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rerunLoading
              ? "Attempting…"
              : "Previous conversion failed. Tap to try again"}
          </button>
          {rerunError && (
            <p className="mt-4 text-base font-medium text-red-600 dark:text-red-400">
              {rerunError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Completed
  if (!conversion.markdown?.trim()) {
    return (
      <div className="flex flex-col items-center justify-start min-h-full w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 w-full max-w-[50%] text-left">
          No notes content.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl px-6 sm:px-8 md:px-12 pt-4 sm:pt-10 md:pt-36 pb-12 md:pb-16 leading-relaxed">
      <article className="prose prose-base sm:prose-lg prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:my-3 sm:prose-p:my-4 prose-p:leading-7 sm:prose-p:leading-8 prose-p:text-base sm:prose-p:text-[1.125rem] prose-ul:my-3 sm:prose-ul:my-4 prose-ol:my-3 sm:prose-ol:my-4 prose-li:my-0.5 prose-li:text-base sm:prose-li:text-[1.125rem] prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800/50 prose-pre:rounded-md prose-pre:px-3 sm:prose-pre:px-4 prose-pre:py-2 sm:prose-pre:py-3 prose-pre:text-sm sm:prose-pre:text-base prose-blockquote:border-l-zinc-300 dark:prose-blockquote:border-l-zinc-600 prose-blockquote:not-italic prose-blockquote:text-base sm:prose-blockquote:text-[1.125rem]">
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
