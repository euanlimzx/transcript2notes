"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Conversion, formatSidebarTitle } from "@/lib/conversions";

const SIDEBAR_WIDTH = 280;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex">
      {/* Sidebar - always open, own scroll */}
      <aside
        className="flex flex-col border-r border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-[#1E1E1E] shrink-0 h-screen overflow-hidden"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="px-3 pt-4 pb-2 shrink-0">
          <span className="text-[11px] text-zinc-500 dark:text-[#A0A0A0] font-medium uppercase tracking-wide">
            makemenotes.com
          </span>
        </div>
        <div className="flex flex-col h-full min-h-0">
          {/* Generate notes - same style as note buttons, create icon on left */}
          <div className="p-2 pt-4 shrink-0">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 text-zinc-700 dark:text-[#E0E0E0] hover:bg-zinc-200 dark:hover:bg-[#282828] transition-colors"
            >
              {/* Lucide file-pen: document with pencil for create/edit */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34" />
                <path d="M14 2v5a1 1 0 0 0 1 1h5" />
                <path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z" />
              </svg>
              Generate Notes
            </button>
          </div>

          {/* "your notes" separator - smaller, muted font */}
          <div className="px-3 pt-4 pb-2 shrink-0">
            <span className="text-[11px] text-zinc-500 dark:text-[#A0A0A0] font-medium uppercase tracking-wide">
              your notes
            </span>
          </div>

          {/* Past transcriptions - scrollable area, independent from main page */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2">
            {conversions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500 dark:text-[#A0A0A0]">
                No past transcriptions
              </p>
            ) : (
              <ul className="px-2 space-y-0.5">
                {conversions.map((c) => {
                  const isActive = pathname === `/notes/${c.id}`;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/notes/${c.id}`)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors flex items-center gap-2 ${
                          isActive
                            ? "bg-zinc-200 dark:bg-[#282828] text-zinc-900 dark:text-white font-medium"
                            : "text-zinc-700 dark:text-[#E0E0E0] hover:bg-zinc-200 dark:hover:bg-[#282828]"
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="shrink-0"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        {formatSidebarTitle(c)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Sign out - bottom, fixed */}
          <div className="p-2 border-t border-zinc-700 shrink-0">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full px-3 py-2 rounded-lg text-sm text-zinc-700 dark:text-[#E0E0E0] hover:bg-zinc-200 dark:hover:bg-[#282828] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content - independent scroll */}
      <main className="flex-1 min-w-0 overflow-auto h-screen">{children}</main>
    </div>
  );
}
