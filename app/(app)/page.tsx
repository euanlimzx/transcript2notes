"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const ROWS_COLLAPSED = 1;
const ROWS_EXPANDED = 4;

export default function HomePage() {
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");

  const isExpanded = isFocused || transcript.trim().length > 0;
  const rows = isExpanded ? ROWS_EXPANDED : ROWS_COLLAPSED;

  useEffect(() => {
    setConnectionStatus("connecting");
    fetch("/api/health", { cache: "no-store" })
      .then((res) => {
        if (res.ok) setConnectionStatus("connected");
        else setConnectionStatus("error");
      })
      .catch(() => setConnectionStatus("error"));
  }, []);

  const handleConvert = useCallback(async () => {
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
  }, [transcript, router]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return; // Shift+Enter = newline
    e.preventDefault();
    handleConvert();
  }

  function handleBlur() {
    setIsFocused(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 sm:px-8">
      <div className="w-full max-w-2xl flex flex-col items-center gap-6">
        <h1 className="text-2xl sm:text-3xl font-medium text-zinc-900 dark:text-white text-center">
          What are we studying today?
        </h1>

        {connectionStatus === "connecting" && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Establishing connection…
          </p>
        )}

        <div
          className={`w-full relative overflow-hidden transition-[max-height] duration-300 ease-out ${isExpanded ? "max-h-40" : "max-h-14"}`}
        >
          <div
            className={`relative flex items-end bg-zinc-100 dark:bg-zinc-800/80 transition-[border-radius] duration-300 ease-out ${
              isExpanded ? "rounded-2xl" : "rounded-3xl"
            }`}
          >
            <textarea
              rows={rows}
              className="w-full resize-none bg-transparent px-5 py-3.5 pr-14 text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none text-base leading-relaxed min-h-0"
              placeholder="Paste your lecture transcript here"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              disabled={loading}
              style={{ overflow: rows === 1 ? "hidden" : "auto" }}
            />
          </div>
        </div>

        {submitError && (
          <p
            className="text-sm text-red-600 dark:text-red-400 text-center"
            role="alert"
          >
            {submitError}
          </p>
        )}
      </div>
    </div>
  );
}
