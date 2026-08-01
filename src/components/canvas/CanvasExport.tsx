"use client";

import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/store/canvas";
import { generateCanvasPdf } from "./generatePdf";
import styles from "./CanvasExport.module.css";

interface CanvasExportProps {
  canvasId: string;
}

export default function CanvasExport({ canvasId }: CanvasExportProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function exportJson() {
    const res = await fetch(`/api/canvas/${canvasId}/snapshot`, { cache: "no-store" });
    if (!res.ok) throw new Error(`export failed: ${res.status}`);
    const data = (await res.json()) as { version: number };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meridian-${canvasId}-snapshot-v${data.version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    setPdfBusy(true);
    try {
      const { nodes, edges } = useCanvasStore.getState();
      if (nodes.length === 0) return;
      const pdf = generateCanvasPdf({
        canvasId,
        nodes,
        edges,
        exportedAt: new Date().toISOString(),
      });
      pdf.save(`meridian-${canvasId}-report.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      setPdfBusy(false);
    }
  }

  async function createShare() {
    setBusy(true);
    setShareError(null);
    setShareUrl(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `share failed: ${res.status}`);
      }
      const { url } = (await res.json()) as { url: string };
      setShareUrl(url);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "share failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      return;
    }
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className={styles.wrap}>
      <button className="btn btn-ghost" onClick={() => void exportJson()} title="Export snapshot as JSON">
        Export
      </button>
      <button
        className="btn btn-ghost"
        onClick={() => void exportPdf()}
        disabled={pdfBusy}
        title="Export intelligence report as PDF"
      >
        {pdfBusy ? "…" : "PDF"}
      </button>
      <button
        className="btn btn-ghost"
        onClick={() => void createShare()}
        disabled={busy}
        title="Create a read-only share link"
      >
        {busy ? "…" : "Share"}
      </button>
      {shareUrl ? (
        <span className={styles.popover}>
          <code className={styles.link}>{shareUrl}</code>
          <button className="btn btn-ghost" onClick={() => void copyShare()}>
            {copied ? "copied" : "copy"}
          </button>
        </span>
      ) : shareError ? (
        <span className={styles.error}>{shareError}</span>
      ) : null}
    </span>
  );
}
