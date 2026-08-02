/**
 * Run a connector once and ingest its events into a canvas.
 *
 * The no-Redis verification path — the BullMQ worker (pnpm
 * worker:connectors) drives the same code when Redis is up.
 *
 * Usage:
 *   pnpm tsx scripts/run-connector.ts gdelt --canvas demo --query "oil tanker" --max 10
 *   pnpm tsx scripts/run-connector.ts opensanctions --canvas demo --dataset peps --max 50
 *   pnpm tsx scripts/run-connector.ts edgar --canvas demo --forms 8-K --max 10
 */

import "dotenv/config";
import { getConnector, listConnectors } from "meridian-connector-sdk/runtime";
import type { EntityStreamEvent } from "meridian-graph-types";
import "../src/connectors";
import { ingestEvents } from "../src/core/ingest/ingest";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const [connectorId] = process.argv.slice(2);
  const canvasId = flag(process.argv, "--canvas") ?? "demo";
  const max = Math.min(Number(flag(process.argv, "--max")) || 25, 250);

  const connector = getConnector(connectorId ?? "");
  if (!connector) {
    console.error(
      `Unknown connector "${connectorId ?? ""}". Registered:\n` +
        listConnectors().map((c) => `  ${c.manifest.id} — ${c.manifest.description}`).join("\n"),
    );
    process.exit(1);
  }

  const config: Record<string, string> = {};
  for (const [key, index] of [
    ["query", process.argv.indexOf("--query")],
    ["dataset", process.argv.indexOf("--dataset")],
    ["maxRecords", process.argv.indexOf("--max")],
    ["hoursBack", process.argv.indexOf("--hours")],
    ["forms", process.argv.indexOf("--forms")],
    ["dateRange", process.argv.indexOf("--daterange")],
    ["baseUrl", process.argv.indexOf("--base-url")],
    ["userAgent", process.argv.indexOf("--user-agent")],
  ] as const) {
    if (index >= 0) {
      const value = process.argv[index + 1];
      if (value !== undefined) config[key] = value;
    }
  }

  await connector.configure(config);
  console.log(
    `Running "${connector.manifest.id}" → canvas "${canvasId}" (max ${max} events)` +
      (Object.keys(config).length ? ` config=${JSON.stringify(config)}` : ""),
  );

  const events: EntityStreamEvent[] = [];
  for await (const event of connector.poll()) {
    events.push(event);
    if (events.length >= max) break;
  }
  console.log(`Fetched ${events.length} event(s) — first sample:`);
  if (events[0]) {
    console.log(
      `  ${events[0].entityType} | ${events[0].entity.name.slice(0, 90)}` +
        ` | ${events[0].sourceUrl.slice(0, 60)}`,
    );
  }

  const result = await ingestEvents(events, canvasId);
  console.log(
    `Ingested → created ${result.cardsCreated}, updated ${result.cardsUpdated}, ` +
      `skipped ${result.cardsSkipped} dupes, ${result.edgesProposed} edges proposed. ` +
      `Open http://localhost:3100/canvas/${canvasId} to review.`,
  );
}

main().catch((error) => {
  console.error("run-connector failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
