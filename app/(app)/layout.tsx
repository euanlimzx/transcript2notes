"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  type Conversion,
  formatSidebarTitle,
} from "@/lib/conversions";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversions, setConversions] = useState<Conversion[]>([]);

  const fetchConversions = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversions")
      .select("id, status, markdown, error, progress, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return;
    setConversions((data ?? []) as Conversion[]);
  }, []);

  useEffect(() => {
    fetchConversions();
  }, [fetchConversions]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  const SIDEBAR_WIDTH = 280;
  const COLLAPSED_WIDTH = 48;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex">
      {/* Sidebar */}
      <aside
        className="flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden"
        style={{ width: sidebarOpen ? SIDEBAR_WIDTH : COLLAPSED_WIDTH }}
      >
        {/* Toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-3 border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${sidebarOpen ? "" : "rotate-180"}`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {sidebarOpen && (
          <>
            {/* Generate notes - top */}
            <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Generate notes
              </button>
            </div>

            {/* Past transcriptions - scrollable middle */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {conversions.length === 0 ? (
                <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
                  No past transcriptions
                </p>
              ) : (
                <ul className="p-2 space-y-0.5">
                  {conversions.map((c) => {
                    const isActive = pathname === `/notes/${c.id}`;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => router.push(`/notes/${c.id}`)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                            isActive
                              ? "bg-zinc-100 dark:bg-zinc-800 font-medium"
                              : ""
                          }`}
                        >
                          {formatSidebarTitle(c)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Sign out - bottom */}
            <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
