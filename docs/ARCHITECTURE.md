# Meridian Architecture

## What it is

Meridian is a graph-first, AI-native investigation workbench. It ingests
heterogeneous public data streams (connectors), stores entities and
relationships in a property graph (Apache AGE), and presents them on
collaborative, versioned canvases. The canvas is the source of truth — every
dashboard and lens is a projection of it.

## Data flow

```
External sources
      │
      ▼
┌─────────────────────────────┐
│ Connector runners (BullMQ)   │  poll() / handleWebhook() per manifest
│ opensanctions · gdelt · ...  │
└─────────────┬───────────────┘
              │ typed EntityStreamEvent
              ▼
┌─────────────────────────────┐
│ EventBus (in-process,       │  Phase 3: Redis-backed fan-out
│ src/core/stream/bus.ts)     │
└──────┬──────────┬───────────┘
       ▼          ▼
┌──────────┐  ┌──────────────────┐
│ Graph DB │  │ AI processor      │
│ (AGE/PG) │  │ (workers/ai)      │
└──────────┘  └──────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ App: canvases (React Flow)   │  timeline/geo are lenses on the same graph
└─────────────────────────────┘
```

## Process topology

- **Next.js app** (`src/`) — SSR routes, RSC data panels, React Flow canvases.
  Server components by default; canvas interactions are client components.
- **Workers** (`workers/`) — BullMQ consumers. Connector runner drains the
  connector queue and publishes stream events; AI processor drains the AI
  queue. Separate processes, run with tsx.
- **EventBus** — in-process pub/sub this phase. The interface is kept tiny so a
  Redis transport can drop in without touching subscribers.

## Storage split

| Concern | Engine | Location |
|---|---|---|
| Identity, auth, workspaces, canvas documents, snapshots | Prisma/PostgreSQL | `prisma/schema.prisma` |
| Entities, relationships (the graph) | Apache AGE | `meridian` graph, same PG instance |
| Dedup fingerprints | computed, stored on AGE vertices | `src/core/graph/dedup.ts` |
| Queues, cross-node bus | Redis | `workers/queues.ts` |
| Files, exports | MinIO (S3) | Phase 3+ |

One Postgres instance runs both workloads: AGE is an extension, the graph and
relational tables coexist in the same database.

## Modules

### src/core/graph
- `age.ts` — `GraphClient`: pooled AGE access, `cypher()` over
  `ag_catalog.cypher`, typed vertex/edge helpers. Server-only.
- `dedup.ts` — pure fingerprint utilities: name normalization, network
  fingerprints, geohash, Levenshtein similarity. `shouldProposeMerge()`
  triggers a *proposed* merge, never an automatic one.

### src/core/stream
- `EventBus.ts` — generic typed pub/sub with topic-prefix subscription.
- `bus.ts` — the platform-wide `meridianBus` for `EntityStreamEvent`s.
- `types.ts` — re-exports canonical stream types; `streamTopic(connectorId)`
  topic convention (`stream:<connectorId>`).

### src/core/ai (Phase 4 surface, skeleton now)
- `client.ts` — server-only OpenRouter client (`complete()`,
  `completeStructured()` via function calling), request-id logging for
  auditability. `AiNotConfiguredError` when the key is missing.

### src/core/collab
- `presence.ts` — Phase 2 target shapes (Yjs + y-websocket); no-op channel
  until then.

## Canvas model

A canvas is a React Flow graph whose nodes are `IntelligenceCard`s (entity,
event, memo, source — see `packages/meridian-graph-types`) and whose edges are
typed relationships. Canonical graph records link to cards via `meridianId`.
Persistence: the relational `Canvas` table + versioned `CanvasSnapshot`
documents (full Yjs CRDT sync lands in Phase 2).

## Security & isolation

- `process.env`-touching modules (`pg`, Prisma, AI client) are server-only;
  client components import only through the Zustand store and `@/store`.
- Connector config values are treated as untrusted strings and never logged
  in full.
- AI output is always `proposed` until an analyst confirms.

## Roadmap

- **Phase 2** — card annotation UI, edge creation, canvas persistence, Yjs presence
- **Phase 3** — connector SDK runtime, first connectors (OpenSanctions, GDELT, EDGAR), status dashboard
- **Phase 4** — AI extraction/inference/anomaly/narrative, NL graph query
- **Phase 5** — timeline, Leaflet geo, PDF/JSON export, shareable links
