"use client";

import { useState } from "react";
import { useCanvasStore } from "@/store/canvas";
import styles from "./AiPanel.module.css";
import type { AnalysisResult } from "@/core/ai/tasks/analyze";
import type { AnomalyResult } from "@/core/ai/tasks/anomalies";
import type { BriefingResult } from "@/core/ai/tasks/briefing";

type Status = "idle" | "analyzing" | "applying" | "done" | "error";
type Tab = "extract" | "anomalies" | "briefing";

export default function AiPanel({ canvasId, onClose }: { canvasId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("extract");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyResult | null>(null);
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
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

  async function runAnomalies() {
    setStatus("analyzing");
    setMessage(null);
    setAnomalies(null);
    try {
      const res = await fetch("/api/ai/anomalies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.hint ?? body.detail ?? body.error ?? "Anomaly scan failed");
        return;
      }
      setAnomalies(body as AnomalyResult);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Request failed");
    }
  }

  async function applyAnomalies() {
    if (!anomalies) return;
    setStatus("applying");
    setMessage(null);
    try {
      const res = await fetch("/api/ai/apply-anomalies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId, anomalies: anomalies.anomalies }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.detail ?? body.error ?? "Apply failed");
        return;
      }
      setMessage(`Applied: ${body.cardsCreated} anomaly memo cards added to canvas.`);
      setStatus("done");
      const snap = await fetch(`/api/canvas/${canvasId}/snapshot`).then((r) => r.json());
      if (snap.document) hydrate(snap.document);
    } catch {
      setStatus("error");
      setMessage("Request failed");
    }
  }

  async function runBriefing() {
    setStatus("analyzing");
    setMessage(null);
    setBriefing(null);
    try {
      const res = await fetch("/api/ai/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.hint ?? body.detail ?? body.error ?? "Briefing generation failed");
        return;
      }
      setBriefing(body as BriefingResult);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Request failed");
    }
  }

  async function applyBriefing() {
    if (!briefing) return;
    setStatus("applying");
    setMessage(null);
    try {
      const res = await fetch("/api/ai/apply-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId, briefing: briefing.briefing }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.detail ?? body.error ?? "Apply failed");
        return;
      }
      setMessage(`Applied: briefing memo card added to canvas.`);
      setStatus("done");
      const snap = await fetch(`/api/canvas/${canvasId}/snapshot`).then((r) => r.json());
      if (snap.document) hydrate(snap.document);
    } catch {
      setStatus("error");
      setMessage("Request failed");
    }
  }

  const busy = status === "analyzing" || status === "applying";

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>AI Analysis</span>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "extract" ? styles.tabActive : ""}`}
          onClick={() => { setTab("extract"); setStatus("idle"); setMessage(null); }}
        >
          Extract
        </button>
        <button
          className={`${styles.tab} ${tab === "anomalies" ? styles.tabActive : ""}`}
          onClick={() => { setTab("anomalies"); setStatus("idle"); setMessage(null); }}
        >
          Anomalies
        </button>
        <button
          className={`${styles.tab} ${tab === "briefing" ? styles.tabActive : ""}`}
          onClick={() => { setTab("briefing"); setStatus("idle"); setMessage(null); }}
        >
          Briefing
        </button>
      </div>

      {tab === "extract" && (
        <>
          <textarea
            className={styles.textarea}
            placeholder="Paste a document, press release, or report…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
          />

          <div className={styles.actions}>
            <button className="btn" onClick={() => void analyze()} disabled={busy}>
              {status === "analyzing" ? "Analyzing…" : "Analyze"}
            </button>
            {analysis ? (
              <button className="btn btn-accent" onClick={() => void apply()} disabled={busy}>
                {status === "applying" ? "Applying…" : `Apply (${analysis.entities.length})`}
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
                        <span className={styles.edgeType}>──{r.type}──</span>
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
        </>
      )}

      {tab === "anomalies" && (
        <>
          <div className={styles.tabDesc}>
            Scans the current canvas for activity spikes, suspicious patterns, and outliers.
          </div>

          <div className={styles.actions}>
            <button className="btn" onClick={() => void runAnomalies()} disabled={busy}>
              {status === "analyzing" ? "Scanning…" : "Scan for anomalies"}
            </button>
            {anomalies && anomalies.anomalies.length > 0 ? (
              <button className="btn btn-accent" onClick={() => void applyAnomalies()} disabled={busy}>
                {status === "applying" ? "Applying…" : `Apply (${anomalies.anomalies.length})`}
              </button>
            ) : null}
          </div>

          {message && (
            <div className={`${styles.message} ${status === "error" ? styles.messageError : ""}`}>
              {message}
            </div>
          )}

          {anomalies ? (
            <div className={styles.results}>
              <div className={styles.resultLabel}>ANOMALY FLAGS · {anomalies.anomalies.length}</div>
              {anomalies.anomalies.length === 0 ? (
                <div className={styles.empty}>No anomalies detected in the current canvas.</div>
              ) : (
                <div className={styles.edgeList}>
                  {anomalies.anomalies.map((a, i) => (
                    <div key={`${a.label}-${i}`} className={styles.edgeRow}>
                      <span className={styles.edgeLine}>
                        <span className={styles.edgeType}>{a.label}</span>
                        <span className={styles.edgeConf}>
                          severity {Math.round(a.severity * 100)}%
                        </span>
                      </span>
                      <span className={styles.edgeConf}>{a.rationale}</span>
                      <span className={styles.edgeConf}>cards: {a.cardIds.join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}

              {anomalies.usage ? (
                <div className={styles.usage}>
                  request {anomalies.requestId.slice(0, 8)} · in {anomalies.usage.inputTokens} / out{" "}
                  {anomalies.usage.outputTokens} tokens
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {tab === "briefing" && (
        <>
          <div className={styles.tabDesc}>
            Generates a concise analyst briefing from the current canvas.
          </div>

          <div className={styles.actions}>
            <button className="btn" onClick={() => void runBriefing()} disabled={busy}>
              {status === "analyzing" ? "Generating…" : "Generate briefing"}
            </button>
            {briefing ? (
              <button className="btn btn-accent" onClick={() => void applyBriefing()} disabled={busy}>
                {status === "applying" ? "Applying…" : "Apply to canvas"}
              </button>
            ) : null}
          </div>

          {message && (
            <div className={`${styles.message} ${status === "error" ? styles.messageError : ""}`}>
              {message}
            </div>
          )}

          {briefing ? (
            <div className={styles.results}>
              <div className={styles.resultLabel}>{briefing.briefing.title}</div>
              <div className={styles.briefingSummary}>{briefing.briefing.summary}</div>
              {briefing.briefing.sections.map((s, i) => (
                <div key={`${s.heading}-${i}`} className={styles.briefingSection}>
                  <div className={styles.briefingHeading}>{s.heading}</div>
                  <div className={styles.briefingBody}>{s.body}</div>
                </div>
              ))}

              {briefing.usage ? (
                <div className={styles.usage}>
                  request {briefing.requestId.slice(0, 8)} · in {briefing.usage.inputTokens} / out{" "}
                  {briefing.usage.outputTokens} tokens
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
