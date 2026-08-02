"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./FeedPanel.module.css";
import type { FeedEvent } from "@/core/stream/publish";

interface WireEvent {
  type: "hello" | "status" | "event";
  event?: FeedEvent;
  redis?: boolean;
  hint?: string;
  ts?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  gdelt: "GDELT",
  opensanctions: "OpenSanctions",
  edgar: "EDGAR",
  ai: "AI",
  mcp: "MCP",
};

const ACTION_LABEL: Record<string, string> = {
  emitted: "emitted",
  applied: "applied",
  proposed: "proposed",
};

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

export default function FeedPanel() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [redisUp, setRedisUp] = useState<boolean | null>(null);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const pausedBuffer = useRef<FeedEvent[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    sourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      setRedisUp(null);
    };
    es.onmessage = (msg) => {
      let wire: WireEvent;
      try {
        wire = JSON.parse(msg.data) as WireEvent;
      } catch {
        return;
      }
      if (wire.type === "status") setRedisUp(wire.redis ?? false);
      if (wire.type === "event" && wire.event) {
        if (paused) {
          pausedBuffer.current.push(wire.event);
          if (pausedBuffer.current.length > 200) pausedBuffer.current.shift();
        } else {
          setEvents((prev) => [wire.event as FeedEvent, ...prev].slice(0, 200));
        }
      }
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [paused]);

  useEffect(() => {
    if (!paused && pausedBuffer.current.length > 0) {
      setEvents((prev) => [...pausedBuffer.current.reverse(), ...prev].slice(0, 200));
      pausedBuffer.current = [];
    }
  }, [paused]);

  const visible = events.filter((e) => filter === "all" || e.source === filter);

  return (
    <div className="panel">
      <div className={styles.toolbar}>
        <span className={`${styles.dot} ${connected ? styles.dotOn : ""}`} />
        <span className={styles.statusText}>
          {connected ? "stream connected" : "reconnecting…"}
          {redisUp !== null && (redisUp ? " · redis up" : " · redis down")}
        </span>
        <select
          className={styles.select}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">all sources</option>
          {Object.entries(SOURCE_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn btn-small" onClick={() => setPaused((p) => !p)}>
          {paused ? `Resume (${pausedBuffer.current.length} buffered)` : "Pause"}
        </button>
        <button
          className="btn btn-small"
          onClick={() => {
            setEvents([]);
            pausedBuffer.current = [];
          }}
        >
          Clear
        </button>
      </div>

      <div ref={listRef} className={styles.list}>
        {visible.length === 0 && (
          <div className={styles.empty}>
            Waiting for events — trigger a connector run, an AI analyze or an
            MCP propose_entity and watch the canvas update live.
          </div>
        )}
        {visible.map((ev) => (
          <div key={ev.id} className={styles.row}>
            <span className={styles.time}>{fmtTime(ev.ts)}</span>
            <span className={`${styles.source} ${styles[`source_${ev.source}`] ?? ""}`}>
              {SOURCE_LABEL[ev.source] ?? ev.source}
            </span>
            {ev.kind === "entity" ? (
              <>
                <span className={styles.action}>{ACTION_LABEL[ev.action] ?? ev.action}</span>
                <span className={styles.name}>{ev.name}</span>
                <span className={styles.meta}>{ev.entityType}</span>
                {ev.canvasId && <span className={styles.meta}>→ {ev.canvasId}</span>}
                {ev.jobId && <span className={styles.meta}>job #{ev.jobId}</span>}
              </>
            ) : (
              <>
                <span className={styles.action}>{ACTION_LABEL[ev.action] ?? ev.action}</span>
                {ev.canvasId && <span className={styles.name}>{ev.canvasId}</span>}
                {ev.summary && (
                  <span className={styles.meta}>
                    {ev.summary.cardsCreated} created · {ev.summary.cardsUpdated} updated ·{" "}
                    {ev.summary.cardsSkipped} dupes · {ev.summary.edgesProposed} edges proposed
                  </span>
                )}
                {ev.jobId && <span className={styles.meta}>job #{ev.jobId}</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
