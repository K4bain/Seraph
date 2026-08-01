/**
 * Connector runner worker.
 *
 * Consumes connectorQueue jobs, drives a connector's poll() /
 * handleWebhook(), and publishes yielded EntityStreamEvents to the
 * in-process EventBus (Redis fan-out lands in Phase 3).
 *
 * Run with: pnpm worker:connectors
 */

import { Worker } from "bullmq";
import { connection, connectorQueue, type ConnectorJobData } from "./queues";
import { getConnector } from "meridian-connector-sdk/runtime";
import { meridianBus } from "../src/core/stream/bus";
import { streamTopic } from "../src/core/stream/types";

const worker = new Worker<ConnectorJobData>(
  connectorQueue.name,
  async (job) => {
    const { connectorId, trigger } = job.data;
    const connector = getConnector(connectorId);

    if (!connector) {
      job.log(`No connector registered for "${connectorId}" — skipping.`);
      return;
    }

    job.log(`Running connector "${connectorId}" (${trigger})`);

    const source = trigger === "webhook" && connector.handleWebhook
      ? connector.handleWebhook(job.data.payload)
      : connector.poll();

    let emitted = 0;
    for await (const event of source) {
      meridianBus.publish(streamTopic(event.connectorId), event);
      emitted += 1;
    }

    job.log(`Emitted ${emitted} EntityStreamEvent(s)`);
  },
  { connection },
);

worker.on("failed", (job, error) => {
  console.error(`[connector-runner] job ${job?.id} failed:`, error);
});

worker.on("ready", () => {
  console.log("[connector-runner] listening for connector jobs");
});

process.on("SIGINT", () => void worker.close());
process.on("SIGTERM", () => void worker.close());
