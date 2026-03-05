"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LightRays from "@/components/ui/light-rays";

const EDU_SUFFIX = ".edu";

function isEduEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain?.toLowerCase().endsWith(EDU_SUFFIX);
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
      text: "Done!Check your inbox for a magic link to sign in.",
    });
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#08090c] text-white">
      {/* LightRays background - full viewport */}
      <div className="absolute inset-0 w-full h-full">
        <LightRays
          raysOrigin="top-center"
          raysColor="#e8e8e8"
          raysSpeed={1}
          lightSpread={1.2}
          rayLength={4}
          pulsating={false}
          fadeDistance={1.5}
          saturation={1}
          followMouse
          mouseInfluence={0.1}
          noiseAmount={0}
          distortion={0}
          className="absolute inset-0 w-full h-full"
        />
      </div>

      {/* Centered content overlay */}
      <main className="relative z-10 flex-1 w-full max-w-3xl px-6 sm:px-8 md:px-10 flex flex-col items-center justify-center text-center">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold mb-4 sm:mb-6 text-white"
          style={{ fontFamily: "Google Sans, sans-serif" }}
        >
          makemenotes.com
        </h1>
        <p
          className="text-lg sm:text-xl md:text-2xl text-zinc-300 mb-8 sm:mb-14"
          style={{ fontFamily: "Google Sans, sans-serif" }}
        >
          Enter your .edu email to get started
        </p>

        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md mx-auto space-y-4 sm:space-y-6"
        >
          <input
            id="email"
            type="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border-2 border-zinc-500 bg-white/5 px-4 sm:px-5 py-4 sm:py-5 text-base sm:text-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 sm:px-8 py-4 sm:py-5 rounded-xl bg-white text-zinc-900 text-base sm:text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-100 transition-colors"
          >
            {loading ? "Sending Magic link…" : "Send Magic Link"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-6 text-lg ${
              message.type === "success" ? "text-white" : "text-red-400"
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
