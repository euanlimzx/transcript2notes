"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/lib/supabase";

type Conversion = {
  id: string;
  status: "pending" | "completed" | "failed";
  markdown: string | null;
  error: string | null;
  created_at: string;
};

function splitMarkdownSections(markdown: string): string[] {
  return markdown.split(/\n(?=## )/).filter(Boolean);
}

export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchConversions = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await supabase
      .from("conversions")
      .select("id, status, markdown, error, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setFetchError(error.message);
      return;
    }
    const rows = (data ?? []) as Conversion[];
    setConversions(rows);
    setSelectedId((prev) => (prev && rows.some((r) => r.id === prev)) ? prev : rows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    fetchConversions();
  }, []);

  const selected = conversions.find((c) => c.id === selectedId);
  const markdown =
    selected?.status === "completed" && selected?.markdown
      ? selected.markdown
      : null;
  const sections = markdown ? splitMarkdownSections(markdown) : [];

  async function handleConvert() {
    const text = transcript.trim();
    if (!text) {
      setSubmitError("Please paste a transcript first.");
      return;
    }
    setSubmitError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.detail ?? "Conversion failed.");
        return;
      }
      const jobId = data.jobId as string | undefined;
      if (jobId) {
        await fetchConversions();
        setSelectedId(jobId);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectConversion(c: Conversion) {
    setSelectedId(c.id);
  }

  async function handleDeleteConversion(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/conversions/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      await fetchConversions();
      if (selectedId === id) {
        const remaining = conversions.filter((c) => c.id !== id);
        setSelectedId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch {
      // ignore
    }
  }

  async function copySection(section: string) {
    try {
      await navigator.clipboard.writeText(section);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Transcript to Notes</h1>

        <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
          Paste transcript
        </label>
        <textarea
          className="w-full min-h-[200px] rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
          placeholder="Paste your transcript here (with or without timestamps like 0:15 ...)"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={loading}
        />

        <button
          type="button"
          onClick={handleConvert}
          disabled={loading}
          className="mt-4 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          {loading ? "Submitting…" : "Convert"}
        </button>

        {submitError && (
          <p
            className="mt-4 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {submitError}
          </p>
        )}

        {fetchError && (
          <p
            className="mt-4 text-sm text-amber-600 dark:text-amber-400"
            role="alert"
          >
            Could not load conversions: {fetchError}
          </p>
        )}

        {conversions.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-medium mb-3">Conversions</h2>
            <ul className="space-y-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
              {conversions.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selectedId === c.id ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
                  onClick={() => handleSelectConversion(c)}
                >
                  <span className="text-sm">
                    {new Date(c.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {c.status === "pending" && " — Converting…"}
                    {c.status === "failed" && " — Failed"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversion(c.id, e)}
                    className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 dark:hover:border-red-800 text-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selected?.status === "pending" && (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
            Conversion in progress. Refresh the page in a few minutes to see the result.
          </p>
        )}

        {selected?.status === "failed" && selected?.error && (
          <p
            className="mt-6 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {selected.error}
          </p>
        )}

        {sections.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-medium mb-4">Notes</h2>
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
        )}
      </main>
    </div>
  );
}
