# Connector Guide

A connector turns a data source into a typed `EntityStreamEvent` stream. The
SDK lives in `packages/seraph-connector-sdk`; this guide shows how to write,
register, and run one.

## Contract

```ts
interface SeraphConnector {
  manifest: ConnectorManifest;          // identity + capabilities
  configure(config: Record<string, string>): Promise<void>;
  poll(): AsyncGenerator<EntityStreamEvent>;              // required
  handleWebhook?(payload: unknown): AsyncGenerator<EntityStreamEvent>; // optional
}
```

Every yielded event must carry provenance: `connectorId`, `sourceUrl`,
`fetchedAt`, `confidence`, and per-entity `sources`. **Provenance is
non-negotiable** — the graph engine and auditors rely on it.

## Writing a connector

```ts
// src/connectors/gdelt/connector.ts
import { defineConnector } from "seraph-connector-sdk";
import type { EntityStreamEvent } from "seraph-graph-types";

export const gdeltConnector = defineConnector({
  manifest: {
    id: "gdelt",
    name: "GDELT",
    version: "0.1.0",
    description: "Global news events, near-real-time",
    author: "seraph",
    pollIntervalMs: 60_000,
    webhookSupported: false,
    entityTypes: ["event", "location"],
  },

  async configure(config) {
    this.config = config; // connector-specific: API keys, filters, locales
  },

  async *poll() {
    // fetch → normalize → yield
    const event: EntityStreamEvent = {
      connectorId: this.manifest.id,
      entityType: "event",
      entity: {
        type: "event",
        name: "...",
        sources: [{ connectorId: "gdelt", url: "...", fetchedAt: new Date().toISOString() }],
      },
      relationships: [],
      sourceUrl: "...",
      fetchedAt: new Date().toISOString(),
      confidence: 0.8,
    };
    yield event;
  },
});
```

Notes:

- `poll()` is an `AsyncGenerator` so huge feeds can stream and be yielded
  incrementally instead of buffered.
- Entities from the *same* connector should reuse a stable `externalId`; the
  graph engine cross-references it during dedup.
- If `pollIntervalMs` is unset the connector is webhook/manual only.
- Connector config must never contain secrets in `manifest`; secrets go into
  `configure(config)` values, stored server-side.

## Registering & running

All connectors register themselves in `src/connectors/index.ts` — the app's
assembly point (it imports every connector and calls `registerConnector`).

Three paths run a connector:

1. **Inline (no Redis, dev/test)** — `src/core/ingest/ingest.ts` engine:
   ```bash
   pnpm tsx scripts/run-connector.ts <id> --canvas <canvasId> [--query ...] [--max 25]
   ```
2. **BullMQ worker (needs Redis)** — `pnpm worker:connectors`, then:
   ```ts
   import { connectorQueue } from "./workers/queues";
   await connectorQueue.add("run", { connectorId: "gdelt", trigger: "schedule", canvasId });
   ```
3. **HTTP** — `POST /api/connectors` `{ connectorId, canvasId, config }`
   (202 + jobId, or 503 with an inline hint when Redis is down);
   `GET /api/connectors` lists registered manifests.

## Event → graph pipeline (Phase 3)

Connector events land in the canvas document — the canvas is the source of
truth (see ARCHITECTURE):

1. **Merge** — `mergeEvents` in `src/core/ingest/ingest.ts` dedups entities by
   name fingerprint and events by title fingerprint; same-identity records
   merge their `sources[]`, aliases, and confidence (max), keeping full
   provenance. Edges are written `proposed: true`.
2. **Write** — `ingestEvents` appends merged events to the canvas snapshot as
   entity/event cards + proposed edges, idempotently (version-collision retry).
3. **Confirm** — analysts accept proposed edges / merge cards in the canvas UI;
   nothing is auto-committed. The AGE graph (self-hosted, `prisma/graph/age-init.sql`)
   stays the long-term graph store once deployed with Apache AGE.

## Connector checklist

- [ ] `manifest.entityTypes` only lists types the connector can emit
- [ ] Every event carries `connectorId`, `sourceUrl`, `fetchedAt`, `confidence`
- [ ] Entities carry per-source `sources[]` provenance
- [ ] Stable `externalId` for same-connector records
- [ ] No secrets in the manifest; secrets via `configure()`
- [ ] Polling yields incrementally (AsyncGenerator), not arrays
