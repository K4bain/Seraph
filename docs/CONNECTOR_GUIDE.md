# Connector Guide

A connector turns a data source into a typed `EntityStreamEvent` stream. The
SDK lives in `packages/meridian-connector-sdk`; this guide shows how to write,
register, and run one.

## Contract

```ts
interface MeridianConnector {
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
import { defineConnector } from "meridian-connector-sdk";
import type { EntityStreamEvent } from "meridian-graph-types";

export const gdeltConnector = defineConnector({
  manifest: {
    id: "gdelt",
    name: "GDELT",
    version: "0.1.0",
    description: "Global news events, near-real-time",
    author: "meridian",
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

```ts
// src/connectors/index.ts — the connector registry assembly point
import { registerConnector } from "meridian-connector-sdk/runtime";
import { gdeltConnector } from "./gdelt/connector";

registerConnector(gdeltConnector);
```

Run the runner worker (`pnpm worker:connectors`), then enqueue a job:

```ts
import { connectorQueue } from "./workers/queues";
await connectorQueue.add("run", { connectorId: "gdelt", trigger: "schedule" });
```

The runner drives `poll()`, publishes each event to the EventBus on topic
`stream:gdelt`, and the graph engine + AI processor consume from there.

## Event → graph pipeline (Phase 3)

1. **Dedup** — `src/core/graph/dedup.ts` fingerprints each entity; exact
   matches merge, fuzzy matches become *proposed merges* awaiting analyst
   confirmation.
2. **Write** — confirmed entities/edges are persisted as AGE vertices/edges
   under labels `Entity` / `Relationship` with full provenance properties.
3. **Fan-out** — the AI processor receives the same events for extraction,
   edge inference, and anomaly flagging (`proposed: true`).

## Connector checklist

- [ ] `manifest.entityTypes` only lists types the connector can emit
- [ ] Every event carries `connectorId`, `sourceUrl`, `fetchedAt`, `confidence`
- [ ] Entities carry per-source `sources[]` provenance
- [ ] Stable `externalId` for same-connector records
- [ ] No secrets in the manifest; secrets via `configure()`
- [ ] Polling yields incrementally (AsyncGenerator), not arrays
