"use client";

import { progressLabel } from "@/lib/conversions";

export default function FakeUIPage() {
  // Use a single representative state: mid-way through generating notes
  const progress = "generating_notes (2/5)";

  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full px-6 py-8">
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-4 uppercase tracking-wider">
        Fake UI — subscription/loading state
      </p>
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse"
          aria-hidden
        />
        <div>
          <p className="text-base font-medium">
            {progressLabel(progress)}
          </p>
          <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
            Do not close this tab. Notes will appear when ready.
          </p>
        </div>
      </div>
    </div>
  );
}
