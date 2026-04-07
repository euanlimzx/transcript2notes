"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./Toast";

type Status = {
  connected: boolean;
  defaultPageId: string | null;
  defaultPageTitle: string | null;
};

type Page = { id: string; title: string };

export function NotionSidebarSection() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [searching, setSearching] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/notion/connect", { cache: "no-store" });
      if (res.ok) {
        setStatus((await res.json()) as Status);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Broadcast status so other components (highlight popover) can react
  useEffect(() => {
    if (status) {
      window.dispatchEvent(new CustomEvent("notion-status", { detail: status }));
    }
  }, [status]);

  async function handleConnect() {
    if (!tokenInput.trim()) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.detail ?? "Failed to connect Notion.", "error");
        return;
      }
      setTokenInput("");
      toast("Notion connected.", "success");
      await loadStatus();
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    const res = await fetch("/api/notion/connect", { method: "DELETE" });
    if (!res.ok) {
      toast("Failed to disconnect.", "error");
      return;
    }
    setStatus({ connected: false, defaultPageId: null, defaultPageTitle: null });
    setPages([]);
    setQuery("");
    toast("Notion disconnected.", "success");
  }

  // Debounced page search
  useEffect(() => {
    if (!status?.connected) return;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/notion/search?q=${encodeURIComponent(query)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setPages((data.pages ?? []) as Page[]);
        } else {
          toast(data.detail ?? "Search failed.", "error");
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, status?.connected, toast]);

  async function pickPage(page: Page) {
    const res = await fetch("/api/notion/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: page.id, pageTitle: page.title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.detail ?? "Failed to set page.", "error");
      return;
    }
    setStatus((prev) =>
      prev ? { ...prev, defaultPageId: page.id, defaultPageTitle: page.title } : prev
    );
    toast(`Linked: ${page.title}`, "success");
  }

  return (
    <div className="px-2 pt-2 pb-2 border-t border-zinc-200 dark:border-zinc-700 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 rounded-lg text-sm flex items-center justify-between text-zinc-700 dark:text-[#E0E0E0] hover:bg-zinc-200 dark:hover:bg-[#282828] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span>Notion</span>
          {status?.connected && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
          )}
        </span>
        <span className="text-xs text-zinc-500">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-2 pt-2 space-y-2">
          {!status?.connected ? (
            <>
              <p className="text-[11px] text-zinc-500 dark:text-[#A0A0A0] leading-snug">
                Paste a Notion internal integration token. Create one at
                notion.so/profile/integrations, then share your target page with it.
              </p>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="secret_…"
                className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting || !tokenInput.trim()}
                className="w-full px-3 py-1.5 rounded-md text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-50"
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
            </>
          ) : (
            <>
              <div className="text-[11px] text-zinc-500 dark:text-[#A0A0A0]">
                Target page:{" "}
                <span className="text-zinc-700 dark:text-zinc-200">
                  {status.defaultPageTitle ?? "none selected"}
                </span>
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your Notion pages"
                className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              <div className="max-h-40 overflow-y-auto rounded-md">
                {searching && (
                  <p className="text-[11px] text-zinc-500 px-2 py-1">Searching…</p>
                )}
                {!searching && pages.length === 0 && (
                  <p className="text-[11px] text-zinc-500 px-2 py-1">
                    No pages. Make sure you shared a page with your integration.
                  </p>
                )}
                {pages.map((p) => {
                  const active = p.id === status.defaultPageId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPage(p)}
                      className={`w-full text-left px-2 py-1 rounded-md text-xs truncate transition-colors ${
                        active
                          ? "bg-zinc-200 dark:bg-[#282828] text-zinc-900 dark:text-white"
                          : "text-zinc-700 dark:text-[#E0E0E0] hover:bg-zinc-200 dark:hover:bg-[#282828]"
                      }`}
                    >
                      {p.title}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                className="w-full px-3 py-1.5 rounded-md text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
