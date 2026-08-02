"use client";

import { useEffect, useState } from "react";
import styles from "./MarketplacePanel.module.css";

export interface MarketplaceConnector {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  pollIntervalMs?: number;
  webhookSupported: boolean;
  entityTypes: string[];
}

function formatInterval(ms?: number): string | null {
  if (!ms) return null;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `polls every ${min} min`;
  const h = min / 60;
  return `polls every ${h % 1 === 0 ? h : h.toFixed(1)} h`;
}

export default function MarketplacePanel({ connectors }: { connectors: MarketplaceConnector[] }) {
  const [canvases, setCanvases] = useState<{ id: string; title: string }[]>([]);
  const [canvasId, setCanvasId] = useState("demo");
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; message: string; ok: boolean } | null>(null);

  useEffect(() => {
    void fetch("/api/canvases")
      .then((r) => (r.ok ? (r.json() as Promise<{ canvases: { id: string; title: string }[] }>) : null))
      .then((data) => {
        if (data?.canvases?.length) {
          setCanvases(data.canvases);
          setCanvasId((prev) =>
            data.canvases!.some((c) => c.id === prev) ? prev : (data.canvases![0]!.id ?? "demo"),
          );
        }
      })
      .catch(() => {
        /* picker falls back to the demo canvas */
      });
  }, []);

  async function run(connector: MarketplaceConnector) {
    setRunning(connector.id);
    setResult(null);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: connector.id, canvasId }),
      });
      const body = (await res.json()) as { jobId?: string; hint?: string; error?: string };
      if (res.ok && body.jobId) {
        setResult({
          id: connector.id,
          ok: true,
          message: `Enqueued as job #${body.jobId} on "${canvasId}" — watch the Live Feed for ingested entities.`,
        });
      } else {
        setResult({ id: connector.id, ok: false, message: body.hint ?? body.error ?? "Unknown error" });
      }
    } catch {
      setResult({ id: connector.id, ok: false, message: "Request failed" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <label className={styles.canvasLabel} htmlFor="market-canvas">
          Target canvas
        </label>
        <select
          id="market-canvas"
          className={styles.canvasSelect}
          value={canvasId}
          onChange={(e) => setCanvasId(e.target.value)}
        >
          {canvases.length === 0 && <option value="demo">demo</option>}
          {canvases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <span className={styles.hint}>Runs are enqueued to BullMQ and drained by the connector worker.</span>
      </div>

      <div className={styles.grid}>
        {connectors.map((c) => (
          <div key={c.id} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardId}>{c.id}</span>
              <span className={styles.cardVersion}>v{c.version}</span>
            </div>
            <div className={styles.cardName}>{c.name}</div>
            <div className={styles.cardAuthor}>{c.author}</div>
            <p className={styles.cardDesc}>{c.description}</p>
            <div className={styles.chips}>
              {c.entityTypes.map((t) => (
                <span key={t} className={styles.chip}>
                  {t}
                </span>
              ))}
            </div>
            <div className={styles.badges}>
              {formatInterval(c.pollIntervalMs) && (
                <span className={styles.badge}>{formatInterval(c.pollIntervalMs)}</span>
              )}
              {c.webhookSupported && <span className={`${styles.badge} ${styles.badgeAccent}`}>webhooks</span>}
            </div>
            <button
              className={styles.runBtn}
              disabled={running !== null}
              onClick={() => void run(c)}
            >
              {running === c.id ? "Enqueuing…" : "Run"}
            </button>
          </div>
        ))}
      </div>

      {result && (
        <div className={`${styles.result} ${result.ok ? "" : styles.resultError}`}>
          <span className="mono">[{result.id}]</span> {result.message}
        </div>
      )}
    </div>
  );
}
