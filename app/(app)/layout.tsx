"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Conversion, formatSidebarTitle } from "@/lib/conversions";
import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";
import { NotionSidebarSection } from "@/components/NotionSidebarSection";
import { jsPDF } from "jspdf";
import JSZip from "jszip";

const SIDEBAR_WIDTH = 280;

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"markdown" | "pdf">("markdown");
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    const id = setTimeout(() => setSidebarOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  const fetchConversions = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversions")
      .select("id, status, markdown, error, progress, name, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return;
    setConversions((data ?? []) as Conversion[]);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchConversions(), 0);
    return () => clearTimeout(id);
  }, [fetchConversions]);

  function startEditing(conversion: Conversion) {
    setEditingId(conversion.id);
    setEditingValue(conversion.name ?? "");
    setRenameError(null);
  }

  async function saveName(jobId: string) {
    const trimmed = editingValue.trim();
    setSavingId(jobId);
    setRenameError(null);
    try {
      const res = await fetch("/api/conversions/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRenameError(data.detail ?? "Failed to save name.");
        return;
      }
      setConversions((prev) =>
        prev.map((c) =>
          c.id === jobId ? { ...c, name: trimmed.length > 0 ? trimmed : null } : c
        )
      );
      setEditingId(null);
    } catch {
      setRenameError(GENERIC_ERROR_MESSAGE);
    } finally {
      setSavingId(null);
    }
  }

  function handleNameKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    jobId: string
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!savingId) {
        void saveName(jobId);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      const original = conversions.find((c) => c.id === jobId)?.name ?? "";
      setEditingValue(original);
      setEditingId(null);
      setRenameError(null);
    }
  }

  function handleNameBlur(jobId: string) {
    if (!savingId && editingId === jobId) {
      void saveName(jobId);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  async function deleteConversion(jobId: string) {
    if (deletingId) return;
    setRenameError(null);
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/conversions/${jobId}`, { method: "DELETE" });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setRenameError(data.detail ?? "Failed to delete note.");
        return;
      }
      setConversions((prev) => prev.filter((c) => c.id !== jobId));
      if (editingId === jobId) {
        setEditingId(null);
        setEditingValue("");
      }
      if (pathname === `/notes/${jobId}`) {
        router.push("/");
      }
    } catch {
      setRenameError(GENERIC_ERROR_MESSAGE);
    } finally {
      setDeletingId(null);
    }
  }

  const exportableConversions = conversions.filter(
    (c) => c.status === "completed" && Boolean(c.markdown?.trim())
  );

  function openExportModal() {
    setExportOpen(true);
    setExportFormat("markdown");
    setSelectedExportIds(exportableConversions.map((c) => c.id));
  }

  function toggleExportSelection(id: string) {
    setSelectedExportIds((prev) =>
      prev.includes(id) ? prev.filter((currentId) => currentId !== id) : [...prev, id]
    );
  }

  function sanitizeFileName(input: string): string {
    const cleaned = input
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, " ");
    return cleaned.length > 0 ? cleaned : "note";
  }

  function buildMarkdownForItem(item: Conversion): string {
    const title = formatSidebarTitle(item);
    const body = item.markdown?.trim() ?? "";
    return `# ${title}\n\n${body}`;
  }

  function buildPdfBuffer(content: string): ArrayBuffer {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });
    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = 16;
    let y = margin;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const lines = doc.splitTextToSize(content, maxWidth) as string[];
    lines.forEach((line) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });

    return doc.output("arraybuffer");
  }

  async function handleExport() {
    if (selectedExportIds.length === 0) {
      setRenameError("Select at least one note to export.");
      return;
    }

    const selected = exportableConversions.filter((c) =>
      selectedExportIds.includes(c.id)
    );
    if (selected.length === 0) {
      setRenameError("No completed notes available to export.");
      return;
    }

    setRenameError(null);
    setExporting(true);
    try {
      const zip = new JSZip();

      selected.forEach((item, idx) => {
        const safeTitle = sanitizeFileName(formatSidebarTitle(item));
        const fileBase = `${String(idx + 1).padStart(2, "0")}-${safeTitle}`;
        const markdown = buildMarkdownForItem(item);

        if (exportFormat === "markdown") {
          zip.file(`${fileBase}.md`, markdown);
          return;
        }

        const pdfBuffer = buildPdfBuffer(markdown);
        zip.file(`${fileBase}.pdf`, pdfBuffer);
      });

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipName =
        exportFormat === "markdown" ? "notes-markdown-export.zip" : "notes-pdf-export.zip";
      const zipUrl = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = zipUrl;
      anchor.download = zipName;
      anchor.click();
      URL.revokeObjectURL(zipUrl);

      if (selected.length > 0) {
        setExportOpen(false);
      }
    } catch {
      setRenameError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex relative">
      {/* Mobile overlay - tap outside to close sidebar */}
      <button
        type="button"
        onClick={() => setSidebarOpen(false)}
        className={`md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Close menu"
      />

      {/* Sidebar - collapsible on mobile */}
      <aside
        className={`flex flex-col border-r border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-[#1E1E1E] shrink-0 h-screen overflow-hidden z-50 transition-transform duration-200 ease-out
          md:translate-x-0 md:static
          fixed inset-y-0 left-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="px-3 pt-4 pb-2 shrink-0 flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-500 dark:text-[#A0A0A0] font-medium uppercase tracking-wide">
            makemenotes.com
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 -mr-1 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
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
            <button
              type="button"
              onClick={openExportModal}
              disabled={exportableConversions.length === 0}
              className="mt-1 w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 text-zinc-700 dark:text-[#E0E0E0] hover:bg-zinc-200 dark:hover:bg-[#282828] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Notes
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
                      <div
                        className={`w-full px-2 py-1 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                          isActive
                            ? "bg-zinc-200 dark:bg-[#282828]"
                            : "hover:bg-zinc-200 dark:hover:bg-[#282828]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => router.push(`/notes/${c.id}`)}
                          className={`flex-1 min-w-0 text-left flex items-center gap-2 ${
                            isActive
                              ? "text-zinc-900 dark:text-white font-medium"
                              : "text-zinc-700 dark:text-[#E0E0E0]"
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
                          {editingId === c.id ? (
                            <input
                              type="text"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => handleNameKeyDown(e, c.id)}
                              onBlur={() => handleNameBlur(c.id)}
                              disabled={savingId === c.id}
                              autoFocus
                              className="w-full bg-transparent focus:outline-none text-xs truncate"
                              placeholder={formatSidebarTitle(c)}
                            />
                          ) : (
                            <span className="truncate">
                              {formatSidebarTitle(c)}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(c);
                          }}
                          className="p-1 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          aria-label="Edit name"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (deletingId) return;
                            const ok = window.confirm(
                              "Delete this note? This action cannot be undone."
                            );
                            if (!ok) return;
                            void deleteConversion(c.id);
                          }}
                          disabled={deletingId === c.id}
                          className="p-1 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Delete note"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <NotionSidebarSection />

          {/* Sign out - bottom, fixed */}
          <div className="p-2 border-t border-zinc-700 shrink-0">
            {renameError && (
              <p className="px-1 pb-1 text-[11px] text-red-600 dark:text-red-400">
                {renameError}
              </p>
            )}
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

      {exportOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Export notes
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Choose the notes you want and pick an export format.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close export dialog"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Files
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedExportIds((prev) =>
                      prev.length === exportableConversions.length
                        ? []
                        : exportableConversions.map((c) => c.id)
                    )
                  }
                  className="text-xs text-zinc-600 dark:text-zinc-300 hover:underline"
                >
                  {selectedExportIds.length === exportableConversions.length
                    ? "Clear all"
                    : "Select all"}
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {exportableConversions.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedExportIds.includes(c.id)}
                      onChange={() => toggleExportSelection(c.id)}
                    />
                    <span className="truncate">{formatSidebarTitle(c)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Format
              </label>
              <div className="mt-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <input
                    type="radio"
                    name="export-format"
                    checked={exportFormat === "markdown"}
                    onChange={() => setExportFormat("markdown")}
                  />
                  Markdown (.md)
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <input
                    type="radio"
                    name="export-format"
                    checked={exportFormat === "pdf"}
                    onChange={() => setExportFormat("pdf")}
                  />
                  PDF (.pdf)
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="px-3 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || selectedExportIds.length === 0}
                className="px-3 py-1.5 rounded-md text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting
                  ? "Exporting…"
                  : `Export ${exportFormat === "markdown" ? "Markdown" : "PDF"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content - independent scroll */}
      <main className="flex-1 min-w-0 overflow-auto h-screen flex flex-col relative">
        {/* Mobile hamburger - floating, no background */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="md:hidden absolute top-4 left-4 z-30 p-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>
        <div className="flex-1 min-h-0 overflow-auto pt-12 md:pt-0">{children}</div>
        <footer className="shrink-0 py-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
          made with ❤️ by{" "}
          <a
            href="https://www.euanlimzx.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            euanlimzx
          </a>
        </footer>
      </main>
    </div>
  );
}
