"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { HighlightPopover } from "@/components/HighlightPopover";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";
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
  const articleRef = useRef<HTMLElement | null>(null);

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

  // Realtime: subscribe to conversion row updates (replaces refresh polling)
  useEffect(() => {
    if (!id || notFound) return;

    const channel = supabase
      .channel(`conversion:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversions",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (process.env.NODE_ENV === "development") {
            console.log("[Realtime] conversion update", payload);
          }
          const row = payload.new as Record<string, unknown>;
          if (!row) return;
          setConversion({
            id: row.id as string,
            status: row.status as Conversion["status"],
            markdown: (row.markdown as string) ?? null,
            error: (row.error as string) ?? null,
            progress: (row.progress as string) ?? null,
            name: (row.name as string) ?? null,
            created_at: row.created_at as string,
          });
          if (
            (row.status as string) === "completed" ||
            (row.status as string) === "failed"
          ) {
            setJobsBefore(null);
          }
        }
      )
      .subscribe((status) => {
        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime] subscription status:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, notFound]);

  // Queue position only (no health/refresh); computed server-side so we poll
  useEffect(() => {
    if (!conversion || conversion.status !== "pending") return;

    const QUEUE_POLL_INTERVAL_MS = 60_000;

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

    fetchQueuePosition();
    const queueTimer = window.setInterval(
      fetchQueuePosition,
      QUEUE_POLL_INTERVAL_MS
    );
    return () => window.clearInterval(queueTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when status or id changes; avoid restarting timer on every Realtime progress tick
  }, [conversion?.status, id]);

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
    } catch {
      setRerunError(GENERIC_ERROR_MESSAGE);
    } finally {
      setRerunLoading(false);
    }
  }

  if (notFound) {
    return (
      <div className="w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto text-left">
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
      <div className="w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <div className="max-w-lg mx-auto flex flex-col items-start text-left">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse shrink-0"
              aria-hidden
            />
            <p className="text-base font-medium">
              {progressLabel(conversion.progress)}
            </p>
          </div>
          <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
            We&apos;re expecting this to take a while, so please check back
            later for updates.
          </p>
          {jobsBefore != null && jobsBefore > 0 && (
            <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
              There are {jobsBefore} job{jobsBefore === 1 ? "" : "s"} ahead of
              you in queue.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (conversion.status === "failed") {
    return (
      <div className="w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <div className="max-w-lg mx-auto flex flex-col items-start text-left">
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
      <div className="w-full px-6 sm:px-8 pt-[30vh] pb-8">
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto text-left">
          No notes content.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl px-6 sm:px-8 md:px-12 pt-4 sm:pt-10 md:pt-36 pb-12 md:pb-16 leading-relaxed">
      <HighlightPopover containerRef={articleRef} />
      <article ref={articleRef} className="prose prose-base sm:prose-lg prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:my-3 sm:prose-p:my-4 prose-p:leading-7 sm:prose-p:leading-8 prose-p:text-base sm:prose-p:text-[1.125rem] prose-ul:my-3 sm:prose-ul:my-4 prose-ol:my-3 sm:prose-ol:my-4 prose-li:my-0.5 prose-li:text-base sm:prose-li:text-[1.125rem] prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800/50 prose-pre:rounded-md prose-pre:px-3 sm:prose-pre:px-4 prose-pre:py-2 sm:prose-pre:py-3 prose-pre:text-sm sm:prose-pre:text-base prose-blockquote:border-l-zinc-300 dark:prose-blockquote:border-l-zinc-600 prose-blockquote:not-italic prose-blockquote:text-base sm:prose-blockquote:text-[1.125rem]">
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
