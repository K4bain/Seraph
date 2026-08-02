/**
 * Connector runner worker.
 *
 * Consumes connectorQueue jobs, drives a connector's poll() /
 * handleWebhook(), publishes yielded EntityStreamEvents to the
 * in-process EventBus (Redis fan-out lands in a later phase), and —
 * when the job carries a target canvas — ingests the events as cards
 * + proposed edges (see src/core/ingest/ingest.ts).
 *
 * Run with: pnpm worker:connectors  (needs Redis up)
 */

import { Worker } from "bullmq";
import { connection, connectorQueue, type ConnectorJobData } from "./queues";
import { getConnector } from "seraph-connector-sdk/runtime";
import type { EntityStreamEvent } from "seraph-graph-types";
import "../src/connectors";
import { seraphBus } from "../src/core/stream/bus";
import { streamTopic } from "../src/core/stream/types";
import { ingestEvents } from "../src/core/ingest/ingest";

const worker = new Worker<ConnectorJobData>(
  connectorQueue.name,
  async (job) => {
    const { connectorId, trigger, canvasId, config } = job.data;
    const connector = getConnector(connectorId);

    if (!connector) {
      job.log(`No connector registered for "${connectorId}" — skipping.`);
      return;
    }

    job.log(`Running connector "${connectorId}" (${trigger})`);
    if (config && Object.keys(config).length > 0) {
      await connector.configure(config);
    }

    const source = trigger === "webhook" && connector.handleWebhook
      ? connector.handleWebhook(job.data.payload)
      : connector.poll();

    let emitted = 0;
    let ingested = 0;
    const batch: EntityStreamEvent[] = [];

    for await (const event of source) {
      seraphBus.publish(streamTopic(event.connectorId), event);
      emitted += 1;
      batch.push(event);
    }

    if (canvasId && batch.length > 0) {
      const result = await ingestEvents(batch, canvasId);
      ingested = result.cardsCreated + result.cardsUpdated;
      job.log(
        `Ingested into "${canvasId}": ${result.cardsCreated} created, ${result.cardsUpdated} updated, ` +
          `${result.cardsSkipped} duplicates, ${result.edgesProposed} edges proposed`,
      );
    }

    job.log(`Emitted ${emitted} EntityStreamEvent(s), ingested ${ingested}`);
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
