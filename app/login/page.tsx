"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const EDU_SUFFIX = ".edu";

function isEduEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain?.toLowerCase().endsWith(EDU_SUFFIX);
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setMessage({ type: "error", text: "Please enter your email." });
      return;
    }
    if (!isEduEmail(trimmed)) {
      setMessage({
        type: "error",
        text: "Please use a .edu email address (e.g. you@university.edu).",
      });
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // Must redirect to /auth/callback so we can exchange the code for a session and set cookies
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setMessage({
      type: "success",
      text: "Check your inbox for a magic link to sign in.",
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
      <main className="w-full max-w-md mx-auto px-4">
        <h1 className="text-2xl font-semibold mb-2">Transcript to Notes</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          Sign in with your .edu email to convert transcripts to study notes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-zinc-600 dark:text-zinc-400"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 dark:hover:bg-zinc-200"
          >
            {loading ? "Sending magic link…" : "Send magic link"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-4 text-sm ${
              message.type === "success"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
            role="alert"
          >
            {message.text}
          </p>
        )}
      </main>
    </div>
  );
}
