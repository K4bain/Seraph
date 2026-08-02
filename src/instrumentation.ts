/**
 * Production background jobs.
 *
 * Railway's free tier caps the project at 5 services, so connector
 * polling and the AGE import run inside the app process instead of the
 * dedicated cron services (services/cron-poll, services/cron-import —
 * kept in the repo for a post-free-tier upgrade). The app process is
 * always-on (Railway services don't auto-sleep), so intervals are as
 * reliable as a cron runner here.
 *
 * register() runs once per server start. Guards: production only,
 * Redis configured, ENABLE_AUTOPOLL !== "false". The import is
 * additionally gated by ENABLE_GRAPH_IMPORT inside core/graph/import.
 */

import { connectorQueue } from "../workers/queues";

const POLL_CONNECTORS = ["gdelt", "opensanctions", "edgar"] as const;
const POLL_INTERVAL_MS = 30 * 60 * 1000;
const POLL_FIRST_RUN_MS = 60 * 1000;
const IMPORT_INTERVAL_MS = 60 * 60 * 1000;
const IMPORT_FIRST_RUN_MS = 90 * 1000;
const IMPORT_CANVAS_ID = "demo";

let started = false;

async function enqueuePoll(): Promise<void> {
  for (const connectorId of POLL_CONNECTORS) {
    // Bounded like the API route — ioredis retries a dead Redis forever.
    try {
      await Promise.race([
        connectorQueue.add("run", {
          connectorId,
          trigger: "schedule",
          canvasId: IMPORT_CANVAS_ID,
        }),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("redis_timeout")), 4000),
        ),
      ]);
    } catch (error) {
      console.error("[autopoll] enqueue failed", connectorId, error);
    }
  }
}

async function runImport(): Promise<void> {
  if (process.env.ENABLE_GRAPH_IMPORT !== "true") return;
  try {
    const { importCanvasToGraph, isGraphImportError } = await import("@/core/graph/import");
    const result = await importCanvasToGraph(IMPORT_CANVAS_ID);
    if (isGraphImportError(result)) {
      console.warn("[autopoll] graph import skipped:", result);
    }
  } catch (error) {
    console.error("[autopoll] graph import failed", error);
  }
}

export async function register(): Promise<void> {
  if (started) return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ENABLE_AUTOPOLL === "false") return;
  if (!process.env.REDIS_URL) return;
  started = true;

  setTimeout(() => {
    void enqueuePoll();
  }, POLL_FIRST_RUN_MS);
  setInterval(() => {
    void enqueuePoll();
  }, POLL_INTERVAL_MS);

  setTimeout(() => {
    void runImport();
  }, IMPORT_FIRST_RUN_MS);
  setInterval(() => {
    void runImport();
  }, IMPORT_INTERVAL_MS);
}
