"use client";

import { progressLabel } from "@/lib/conversions";

export default function FakeUIPage() {
  const progress = "generating_notes (2/5)";
  const jobsBefore: number | null = 1; // use 0 for "processing now", or null for "unknown queue"
  const fakeError =
    "Connection timeout after 30s (example long error message that would previously stretch across the full width)";

  return (
    <div className="flex flex-col items-center min-h-full w-full px-6 sm:px-8 py-8 gap-16">
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider w-full max-w-[50%] text-left">
        Fake UI — main label fixed at start, only subtext changes
      </p>

      {/* 1. Home: submit error */}
      <section className="flex flex-col items-center gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider w-full max-w-[50%] text-left">
          Home — submit error
        </p>
        <p
          className="text-sm text-red-600 dark:text-red-400 w-full max-w-[50%] text-left"
          role="alert"
        >
          Unauthorized. Please sign in. (Example of a longer API error message.)
        </p>
      </section>

      {/* 2. Notes: not found */}
      <section className="flex flex-col items-center gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider w-full max-w-[50%] text-left">
          Notes — not found
        </p>
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 w-full max-w-[50%] text-left">
          Conversion not found.
        </p>
      </section>

      {/* 3. Notes: pending — main label stays put, only subtext wraps */}
      <section className="flex flex-col items-center gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider w-full max-w-[50%] text-left">
          Notes — pending (label fixed at start)
        </p>
        <div className="flex items-start gap-2 w-full max-w-[50%]">
          <span
            className="inline-block w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse shrink-0 mt-1.5"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">{progressLabel(progress)}</p>
            <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
              {jobsBefore !== null
                ? jobsBefore === 0
                  ? "We're currently processing your transcript right now. We're expecting this to take a while, so feel free to check back in later for updates."
                  : `There are ${jobsBefore} job${jobsBefore === 1 ? "" : "s"} ahead of you in queue right now. We're expecting this to take a while, so feel free to check back in later for updates.`
                : "We're expecting this to take a while, so feel free to check back in later for updates."}
            </p>
          </div>
        </div>
      </section>

      {/* 4. Notes: failed — error (main) fixed at start, button and rerun error below */}
      <section className="flex flex-col items-center gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider w-full max-w-[50%] text-left">
          Notes — failed
        </p>
        <div className="w-full max-w-[50%] flex flex-col items-start text-left">
          <p
            className="text-base font-medium text-red-600 dark:text-red-400 mb-4"
            role="alert"
          >
            {fakeError}
          </p>
          <button
            type="button"
            className="text-sm sm:text-base font-medium px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Previous conversion failed. Tap to try again
          </button>
          <p className="mt-4 text-base font-medium text-red-600 dark:text-red-400">
            Re-run failed.
          </p>
        </div>
      </section>

      {/* 5. Notes: completed empty */}
      <section className="flex flex-col items-center gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider w-full max-w-[50%] text-left">
          Notes — completed, no content
        </p>
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 w-full max-w-[50%] text-left">
          No notes content.
        </p>
      </section>
    </div>
  );
}
