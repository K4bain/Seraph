"use client";

import { useState } from "react";
import { useCanvasStore } from "@/store/canvas";
import styles from "./AiPanel.module.css";
import type { AnalysisResult } from "@/core/ai/tasks/analyze";

type Status = "idle" | "analyzing" | "applying" | "done" | "error";

export default function AiPanel({ canvasId, onClose }: { canvasId: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hydrate = useCanvasStore((s) => s.hydrate);

  async function analyze() {
    if (text.trim().length < 40) {
      setMessage("Paste at least a few sentences of source material.");
      setStatus("error");
      return;
    }
    setStatus("analyzing");
    setMessage(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.hint ?? body.detail ?? body.error ?? "Analysis failed");
        return;
      }
      setAnalysis(body as AnalysisResult);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Request failed");
    }
  }

  async function apply() {
    if (!analysis) return;
    setStatus("applying");
    setMessage(null);
    try {
      const res = await fetch("/api/ai/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId, analysis }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.detail ?? body.error ?? "Apply failed");
        return;
      }
      setMessage(
        `Applied: ${body.result.cardsCreated} cards created, ${body.result.cardsUpdated} updated, ` +
          `${body.result.cardsSkipped} duplicates, ${body.result.edgesProposed} edges proposed.`,
      );
      setStatus("done");
      const snap = await fetch(`/api/canvas/${canvasId}/snapshot`).then((r) => r.json());
      if (snap.document) hydrate(snap.document);
    } catch {
      setStatus("error");
      setMessage("Request failed");
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>AI Analysis</span>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <textarea
        className={styles.textarea}
        placeholder="Paste a document, press release, or report…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
      />

      <div className={styles.actions}>
        <button className="btn" onClick={() => void analyze()} disabled={status === "analyzing" || status === "applying"}>
          {status === "analyzing" ? "Analyzing…" : "Analyze"}
        </button>
        {analysis ? (
          <button
            className="btn btn-accent"
            onClick={() => void apply()}
            disabled={status === "analyzing" || status === "applying"}
          >
            {status === "applying" ? "Applying…" : `Apply to canvas (${analysis.entities.length})`}
          </button>
        ) : null}
      </div>

      {message && (
        <div className={`${styles.message} ${status === "error" ? styles.messageError : ""}`}>
          {message}
        </div>
      )}

      {analysis ? (
        <div className={styles.results}>
          <div className={styles.resultLabel}>ENTITIES · {analysis.entities.length}</div>
          <div className={styles.entityList}>
            {analysis.entities.map((e) => (
              <span key={e.name} className={styles.chip}>
                <span className={styles.chipType}>{e.type}</span>
                {e.name}
              </span>
            ))}
          </div>

          <div className={styles.resultLabel}>PROPOSED EDGES · {analysis.relationships.length}</div>
          {analysis.relationships.length === 0 ? (
            <div className={styles.empty}>No relationships found in this document.</div>
          ) : (
            <div className={styles.edgeList}>
              {analysis.relationships.map((r) => (
                <div key={`${r.source}--${r.type}--${r.target}`} className={styles.edgeRow}>
                  <span className={styles.edgeLine}>
                    <span className={styles.edgeSrc}>{r.source}</span>
                    <span className={styles.edgeType}>
                      ──{r.type}──
                    </span>
                    <span className={styles.edgeTgt}>{r.target}</span>
                  </span>
                  <span className={styles.edgeConf}>
                    {r.confidence !== undefined ? `${Math.round(r.confidence * 100)}%` : ""}
                    {r.rationale ? ` · ${r.rationale}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {analysis.usage ? (
            <div className={styles.usage}>
              request {analysis.requestId.slice(0, 8)} · in {analysis.usage.inputTokens} / out{" "}
              {analysis.usage.outputTokens} tokens
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
