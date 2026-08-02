# Seraph Architecture

## What it is

Seraph is a graph-first, AI-native investigation workbench. It ingests
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
│ EventBus + SSE feed          │  Redis-backed fan-out; live feed at /feed
│ src/core/stream/publish.ts  │
└──────┬──────────┬───────────┘
       ▼          ▼
┌──────────┐  ┌──────────────────┐
│ Graph DB │  │ AI processor      │
│ (AGE/PG) │  │ (workers/ai)      │
└──────────┘  └──────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ App: canvases (React Flow)   │  timeline/geo/globe are lenses
│ MCP endpoint (/api/mcp)      │  connectors + AI → proposed cards
└─────────────────────────────┘
```

## Process topology

- **Next.js app** (`src/`) — SSR routes, RSC data panels, React Flow canvases.
  Server components by default; canvas interactions are client components.
- **Workers** (`workers/`) — BullMQ consumers. Connector runner drains the
  connector queue and publishes stream events; AI processor drains the AI
  queue. Separate processes, run with tsx.
- **EventBus** — Redis-backed pub/sub for connector/AI events, with an SSE
  live feed at `/feed`.
- **MCP endpoint** (`/api/mcp`) — Streamable HTTP MCP server exposing tools
  for external AI agents to query and mutate canvases.

## Storage split

| Concern | Engine | Location |
|---|---|---|
| Identity, auth, workspaces, canvas documents, snapshots | Prisma/PostgreSQL | `prisma/schema.prisma` |
| Entities, relationships (the graph) | Apache AGE | `seraph` graph, same PG instance |
| Dedup fingerprints | computed, stored on AGE vertices | `src/core/graph/dedup.ts` |
| Queues, cross-node bus, SSE feed | Redis | `workers/queues.ts` |
| Files, exports | MinIO (S3) | optional, not yet wired |

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
- `bus.ts` — the platform-wide `seraphBus` for `EntityStreamEvent`s.
- `types.ts` — re-exports canonical stream types; `streamTopic(connectorId)`
  topic convention (`stream:<connectorId>`).

### src/core/ai (Phase 4)
- `client.ts` — server-only OpenRouter client (`complete()`,
  `completeStructured()` via function calling), request-id logging for
  auditability. `AiNotConfiguredError` when the key is missing.

### src/core/mcp
- MCP endpoint handler — Streamable HTTP transport, Bearer auth via
  HMAC-keyed API tokens, tool dispatch to canvas/graph/connector ops.

### src/core/keys
- API key CRUD — HMAC-signed tokens, `API_KEY_HMAC_SECRET` or
  `AUTH_SECRET` as signing key, Prisma-backed storage.

### src/core/stream
- `EventBus.ts` — generic typed pub/sub with topic-prefix subscription.
- `bus.ts` — the platform-wide `seraphBus` for `EntityStreamEvent`s.
- `types.ts` — re-exports canonical stream types; `streamTopic(connectorId)`
  topic convention (`stream:<connectorId>`).
- `publish.ts` — best-effort Redis publisher for SSE feed and job events.

## Canvas model

A canvas is a React Flow graph whose nodes are `IntelligenceCard`s (entity,
event, memo, source — see `packages/seraph-graph-types`) and whose edges are
typed relationships. Canonical graph records link to cards via `seraphId`.
Persistence: the relational `Canvas` table + versioned `CanvasSnapshot`
documents (Yjs CRDT presence sync via the collab server at `:3001`).

## Security & isolation

- `process.env`-touching modules (`pg`, Prisma, AI client) are server-only;
  client components import only through the Zustand store and `@/store`.
- Connector config values are treated as untrusted strings and never logged
  in full.
- AI output is always `proposed` until an analyst confirms.

## Roadmap

All phases below are **done** (v0.1):

- **Phase 2** — card annotation UI, edge creation, canvas persistence, Yjs presence
- **Phase 3** — connector SDK runtime, first connectors (OpenSanctions, GDELT,
  EDGAR), status dashboard, AGE graph import bridge
- **Phase 4** — AI extraction + edge inference via OpenRouter (function
  calling, instruction-only fallback), canvas AI panel, apply pipeline
- **Phase 5** — timeline, Leaflet geo (both `?canvas=` parameterized), CesiumJS
  3D globe, client-side PDF export (jsPDF), JSON snapshot export, shareable
  read-only links
- **Phase 6** — MCP endpoint (`/api/mcp`) for external AI agents, live SSE
  feed (`/feed`), API key management, connector marketplace gallery
