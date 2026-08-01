"use client";

import { useState } from "react";

interface Manifest {
  id: string;
  name: string;
  version: string;
  description: string;
  entityTypes: string[];
}

export default function ConnectorRunPanel({ connectors }: { connectors: Manifest[] }) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; message: string; ok: boolean } | null>(null);

  async function run(connector: Manifest) {
    setRunning(connector.id);
    setResult(null);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: connector.id, canvasId: "demo" }),
      });
      const body = (await res.json()) as { jobId?: string; hint?: string; error?: string };
      if (res.ok && body.jobId) {
        setResult({
          id: connector.id,
          ok: true,
          message: `Enqueued as job #${body.jobId} — watch the dashboard for completion.`,
        });
      } else {
        setResult({
          id: connector.id,
          ok: false,
          message: body.hint ?? body.error ?? "Unknown error",
        });
      }
    } catch {
      setResult({ id: connector.id, ok: false, message: "Request failed" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Run a Connector</h2>
      <div className="connector-grid">
        {connectors.map((c) => (
          <div key={c.id} className="connector-card">
            <div className="connector-card-head">
              <span className="mono" style={{ color: "var(--text)" }}>
                {c.id}
              </span>
              <span className="mono" style={{ color: "var(--text-faint)" }}>
                v{c.version}
              </span>
            </div>
            <div className="connector-card-name">{c.name}</div>
            <div className="connector-card-desc">{c.description}</div>
            <div className="mono connector-card-types">
              {c.entityTypes.join(", ")}
            </div>
            <button
              className="btn"
              disabled={running !== null}
              onClick={() => void run(c)}
            >
              {running === c.id ? "Enqueuing…" : "Run now → canvas demo"}
            </button>
          </div>
        ))}
      </div>
      {result && (
        <div className={`run-result ${result.ok ? "" : "run-result-error"}`}>
          <span className="mono">[{result.id}]</span> {result.message}
        </div>
      )}
    </div>
  );
}
