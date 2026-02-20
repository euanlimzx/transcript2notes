"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const RUNS_STORAGE_KEY = "transcript2notes_runs";
const LEGACY_STORAGE_KEY = "transcript2notes_output";

type Run = { id: string; createdAt: string; markdown: string };

function splitMarkdownSections(markdown: string): string[] {
  return markdown.split(/\n(?=## )/).filter(Boolean);
}

function loadRuns(): Run[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RUNS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const runs = parsed.filter(
          (r): r is Run =>
            r != null &&
            typeof r === "object" &&
            typeof (r as Run).id === "string" &&
            typeof (r as Run).createdAt === "string" &&
            typeof (r as Run).markdown === "string"
        );
        return runs;
      }
    }
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy != null && legacy.trim() !== "") {
      const run: Run = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        markdown: legacy,
      };
      window.localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify([run]));
      return [run];
    }
    return [];
  } catch {
    return [];
  }
}

function saveRuns(runs: Run[]) {
  try {
    window.localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // ignore quota or privacy errors
  }
}

function addRun(markdown: string, currentRuns: Run[]): Run {
  const run: Run = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    markdown,
  };
  const next = [run, ...currentRuns];
  saveRuns(next);
  return run;
}

function deleteRunById(id: string, runs: Run[]): Run[] {
  const next = runs.filter((r) => r.id !== id);
  saveRuns(next);
  return next;
}

export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadRuns();
    setRuns(loaded);
    if (loaded.length > 0) {
      setMarkdown(loaded[0].markdown);
      setSelectedRunId(loaded[0].id);
    }
  }, []);

  async function handleConvert() {
    const text = transcript.trim();
    if (!text) {
      setError("Please paste a transcript first.");
      return;
    }
    setError(null);
    setLoading(true);
    setMarkdown(null);
    try {
      const res = await fetch(`${API_URL}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Conversion failed.");
        return;
      }
      const result = data.markdown ?? "";
      setMarkdown(result);
      setRuns((prev) => {
        const newRun = addRun(result, prev);
        setSelectedRunId(newRun.id);
        return [newRun, ...prev];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectRun(run: Run) {
    setMarkdown(run.markdown);
    setSelectedRunId(run.id);
  }

  function handleDeleteRun(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = deleteRunById(id, runs);
    setRuns(next);
    if (selectedRunId === id) {
      setMarkdown(next.length > 0 ? next[0].markdown : null);
      setSelectedRunId(next.length > 0 ? next[0].id : null);
    }
  }

  async function copySection(section: string) {
    try {
      await navigator.clipboard.writeText(section);
    } catch {
      // ignore
    }
  }

  const sections = markdown ? splitMarkdownSections(markdown) : [];

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
          {loading ? "Converting…" : "Convert"}
        </button>

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        {runs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-medium mb-3">Past transcriptions</h2>
            <ul className="space-y-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selectedRunId === run.id ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
                  onClick={() => handleSelectRun(run)}
                >
                  <span className="text-sm">
                    {new Date(run.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteRun(run.id, e)}
                    className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 dark:hover:border-red-800 text-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
