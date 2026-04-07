"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

type PopoverState = {
  text: string;
  x: number;
  y: number;
} | null;

type NotionStatus = {
  connected: boolean;
  defaultPageId: string | null;
  defaultPageTitle: string | null;
};

export function HighlightPopover({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const { toast } = useToast();
  const [popover, setPopover] = useState<PopoverState>(null);
  const [notion, setNotion] = useState<NotionStatus | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Load Notion status once, plus listen for live updates from sidebar
  useEffect(() => {
    fetch("/api/notion/connect", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setNotion(data as NotionStatus))
      .catch(() => {});
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NotionStatus>).detail;
      if (detail) setNotion(detail);
    };
    window.addEventListener("notion-status", handler);
    return () => window.removeEventListener("notion-status", handler);
  }, []);

  useEffect(() => {
    function handleSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setPopover(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setPopover(null);
        return;
      }
      const container = containerRef.current;
      if (!container) return;
      const anchor = sel.anchorNode;
      if (!anchor || !container.contains(anchor)) {
        setPopover(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setPopover({
        text,
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + window.scrollY - 8,
      });
    }

    function handlePointerDown(e: PointerEvent) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      // Let selectionchange handle dismissal on click
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [containerRef]);

  async function handleCopy() {
    if (!popover) return;
    try {
      await navigator.clipboard.writeText(popover.text);
      toast("Copied", "success");
    } catch {
      toast("Copy failed", "error");
    }
    setPopover(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleNotion() {
    if (!popover) return;
    const text = popover.text;
    // Fire-and-forget — toast immediately
    toast("Sent to Notion", "success");
    setPopover(null);
    window.getSelection()?.removeAllRanges();
    fetch("/api/notion/append", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast(data.detail ?? "Notion append failed.", "error");
        }
      })
      .catch(() => toast("Notion append failed.", "error"));
  }

  if (!popover) return null;

  const notionReady = notion?.connected && !!notion.defaultPageId;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 -translate-x-1/2 -translate-y-full flex items-center gap-1 rounded-lg bg-zinc-900 text-white shadow-lg px-1 py-1"
      style={{ left: popover.x, top: popover.y }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={handleCopy}
        className="px-2.5 py-1 text-xs rounded-md hover:bg-zinc-700"
      >
        Copy
      </button>
      {notionReady && (
        <button
          type="button"
          onClick={handleNotion}
          className="px-2.5 py-1 text-xs rounded-md hover:bg-zinc-700"
        >
          Notion
        </button>
      )}
    </div>
  );
}
