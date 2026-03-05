"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");

  useEffect(() => {
    setConnectionStatus("connecting");
    fetch("/api/health", { cache: "no-store" })
      .then((res) => {
        if (res.ok) setConnectionStatus("connected");
        else setConnectionStatus("error");
      })
      .catch(() => setConnectionStatus("error"));
  }, []);

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
        router.push(`/notes/${jobId}`);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-6">Transcript to Notes</h1>

      {connectionStatus === "connecting" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Establishing connection…
        </p>
      )}

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
    </div>
  );
}
