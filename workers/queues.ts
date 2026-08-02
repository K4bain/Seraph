/**
 * Shared queue definitions for background work.
 *
 * - connectorQueue: scheduled/webhook connector runs → emit EntityStreamEvents
 * - aiQueue: entity extraction, edge inference, anomaly flags
 *
 * Runs on Redis (REDIS_URL). Phase 1 ships the plumbing; Phase 3 wires
 * actual connector processors into connectorQueue.
 */

import { Queue, type ConnectionOptions } from "bullmq";

function redisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    // Upstash etc. use TLS: rediss:// → ioredis tls:{} (verify via system CAs)
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export interface ConnectorJobData {
  connectorId: string;
  trigger: "schedule" | "webhook" | "mcp" | "manual";
  /** Target canvas for ingestion �?" events land here as cards + proposed edges. */
  canvasId?: string;
  /** Raw connector config (query, limits, dataset, ...). Secrets stay server-side. */
  config?: Record<string, string>;
  payload?: unknown;
}

export interface AiJobData {
  task: "extract_entities" | "infer_edges" | "flag_anomalies" | "generate_briefing";
  document?: string;
  url?: string;
  canvasId?: string;
}

export const connection = redisConnection();

export const connectorQueue = new Queue<ConnectorJobData>("seraph-connectors", {
  connection,
});

export const aiQueue = new Queue<AiJobData>("seraph-ai", {
  connection,
});
