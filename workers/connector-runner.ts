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

import "dotenv/config";
import { Worker } from "bullmq";
import { connection, connectorQueue, watchlistQueue, type ConnectorJobData, type WatchlistJobData } from "./queues";
import { getConnector } from "seraph-connector-sdk/runtime";
import type { EntityStreamEvent } from "seraph-graph-types";
import "../src/connectors";
import { seraphBus } from "../src/core/stream/bus";
import { streamTopic } from "../src/core/stream/types";
import { ingestEvents } from "../src/core/ingest/ingest";
import { publishFeedEvent } from "../src/core/stream/publish";
import { pollWatchlist } from "../src/core/feed/watchlist";

// Register the 30-minute watchlist sweep. Fixed scheduler id keeps this
// idempotent across worker restarts.
void watchlistQueue.upsertJobScheduler(
  "watchlist-poll",
  { every: 30 * 60 * 1000 },
  { name: "poll", data: { task: "poll" } },
);

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

    // Search-only connectors (wikidata/github/whois) implement no
    // poll() — a scheduled run on them is a no-op.
    if (!connector.poll) {
      job.log(`Connector "${connectorId}" is search-only — nothing to poll.`);
      return;
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
      void publishFeedEvent({
        kind: "entity",
        id: `${event.connectorId}:${event.entity.externalId}:${event.fetchedAt}`,
        ts: new Date().toISOString(),
        source: event.connectorId,
        connectorId: event.connectorId,
        canvasId,
        jobId: String(job.id),
        entityType: event.entityType,
        name: event.entity.name,
        externalId: event.entity.externalId,
        action: "emitted",
      });
    }

    if (canvasId && batch.length > 0) {
      const result = await ingestEvents(batch, canvasId);
      ingested = result.cardsCreated + result.cardsUpdated;
      job.log(
        `Ingested into "${canvasId}": ${result.cardsCreated} created, ${result.cardsUpdated} updated, ` +
          `${result.cardsSkipped} duplicates, ${result.edgesProposed} edges proposed`,
      );
      void publishFeedEvent({
        kind: "batch",
        id: `${connectorId}:batch:${job.id}:${Date.now().toString(36)}`,
        ts: new Date().toISOString(),
        source: connectorId,
        connectorId,
        canvasId,
        jobId: String(job.id),
        action: "applied",
        summary: {
          cardsCreated: result.cardsCreated,
          cardsUpdated: result.cardsUpdated,
          cardsSkipped: result.cardsSkipped,
          edgesProposed: result.edgesProposed,
        },
      });
    }

    job.log(`Emitted ${emitted} EntityStreamEvent(s), ingested ${ingested}`);
  },
  { connection },
);

worker.on("failed", (job, error) => {
  console.error(`[connector-runner] job ${job?.id} failed:`, error);
});

const watchlistWorker = new Worker<WatchlistJobData>(
  watchlistQueue.name,
  async (job) => {
    const result = await pollWatchlist();
    job.log(
      `Watchlist poll: ${result.itemsChecked} item(s) checked, ${result.alertsCreated} alert(s) created, ` +
        `${result.skippedDuplicates} duplicate(s) skipped, ${result.errors.length} error(s)`,
    );
    for (const failure of result.errors) {
      job.log(`  ! "${failure.term}": ${failure.error}`);
    }
  },
  { connection },
);

watchlistWorker.on("failed", (job, error) => {
  console.error(`[watchlist] job ${job?.id} failed:`, error);
});

worker.on("ready", () => {
  console.log("[connector-runner] listening for connector jobs");
});

watchlistWorker.on("ready", () => {
  console.log("[watchlist] listening (30-minute poll registered)");
});

process.on("SIGINT", () => {
  void worker.close();
  void watchlistWorker.close();
});
process.on("SIGTERM", () => {
  void worker.close();
  void watchlistWorker.close();
});
