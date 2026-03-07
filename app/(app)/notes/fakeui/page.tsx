"use client";

import { progressLabel } from "@/lib/conversions";

export default function FakeUIPage() {
  const progress = "generating_notes (2/5)";
  const fakeError =
    "Connection timeout after 30s (example long error message that would previously stretch across the full width)";

  return (
    <div className="w-full px-6 sm:px-8 py-8 gap-16 flex flex-col">
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider max-w-lg mx-auto text-left w-full">
        Fake UI — narrow container centered, text start-aligned
      </p>

      {/* 1. Home: submit error */}
      <section className="flex flex-col gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider max-w-lg mx-auto text-left w-full">
          Home — submit error
        </p>
        <p
          className="text-sm text-red-600 dark:text-red-400 max-w-lg mx-auto text-left w-full"
          role="alert"
        >
          Unauthorized. Please sign in. (Example of a longer API error message.)
        </p>
      </section>

      {/* 2. Notes: not found */}
      <section className="flex flex-col gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider max-w-lg mx-auto text-left w-full">
          Notes — not found
        </p>
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto text-left w-full">
          Conversion not found.
        </p>
      </section>

      {/* 3a. Notes: pending — with queue number */}
      <section className="flex flex-col gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider max-w-lg mx-auto text-left w-full">
          Notes — pending (with queue number)
        </p>
        <div className="max-w-lg mx-auto w-full flex flex-col items-start text-left">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse shrink-0"
              aria-hidden
            />
            <p className="text-base font-medium">{progressLabel(progress)}</p>
          </div>
          <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
            We\u2019re expecting this to take a while, so please check back later for updates.
          </p>
          <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
            There are 3 jobs ahead of you in queue.
          </p>
        </div>
      </section>

      {/* 3b. Notes: pending — no queue message */}
      <section className="flex flex-col gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider max-w-lg mx-auto text-left w-full">
          Notes — pending (no queue message)
        </p>
        <div className="max-w-lg mx-auto w-full flex flex-col items-start text-left">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse shrink-0"
              aria-hidden
            />
            <p className="text-base font-medium">{progressLabel(progress)}</p>
          </div>
          <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
            We\u2019re expecting this to take a while, so please check back later for updates.
          </p>
        </div>
      </section>

      {/* 4. Notes: failed */}
      <section className="flex flex-col gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider max-w-lg mx-auto text-left w-full">
          Notes — failed
        </p>
        <div className="max-w-lg mx-auto w-full flex flex-col items-start text-left">
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
      <section className="flex flex-col gap-4 w-full">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider max-w-lg mx-auto text-left w-full">
          Notes — completed, no content
        </p>
        <p className="text-base font-medium text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto text-left w-full">
          No notes content.
        </p>
      </section>
    </div>
  );
}
