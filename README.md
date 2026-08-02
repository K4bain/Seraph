# Seraph

Open-source intelligence fusion platform. Graph-first, AI-native investigation
canvases for OSINT researchers, journalists, and analysts.

Palantir sells you a black box. **Seraph** gives you the engine room: ingest
heterogeneous public data streams, surface relationships, anomalies, and
narratives, and build shareable investigation canvases where every entity is a
node, every relationship is an edge, and every insight is a version-controlled
object.

**Status:** v0.1 — all core phases complete. Canvas persistence (snapshot
autosave, edge inspector, inline card editing), realtime presence (Yjs
cursors/selection), connector runtime (OpenSanctions, GDELT DOC API, SEC EDGAR)
with BullMQ workers, AGE graph import bridge, AI extraction/inference via
OpenRouter (function calling, proposed edges), timeline + geo lenses (Leaflet),
3D globe (CesiumJS), client-side PDF export (jsPDF), JSON snapshot export,
token-based shareable links, MCP endpoint (`/api/mcp`), live SSE feed, and a
connector marketplace gallery. Deployed to Railway with Docker Compose fallback.

## Quickstart

```bash
# 1. Database — self-hosted (PostgreSQL + Apache AGE, Redis, MinIO)
docker compose up -d

#    …or serverless Postgres (no AGE graph): set DATABASE_URL in .env
#    (see .env.example). Seraph uses the Neon HTTP driver via
#    @prisma/adapter-neon.

# 2. Install + relational schema
pnpm install          # runs prisma generate (postinstall)
pnpm db:push

# 3. Seed demo data (optional)
pnpm db:seed

# 4. Run
pnpm dev          # → http://localhost:3000 (canvas at /canvas/demo)

# 5. Realtime presence (optional — Yjs cursors, selection)
pnpm collab:server   # in-memory WS server, default ws://localhost:3001
```

The `seraph` AGE graph is created automatically on first volume init from
`prisma/graph/age-init.sql`. Workers (optional, need Redis): `pnpm
worker:connectors`, `pnpm worker:ai`.

## Repository map

```
src/app/                  App Router routes — server components by default
src/components/canvas/    React Flow nodes/edges + inspector + AI panel + export
src/components/geo/       Leaflet map view
src/components/globe/     CesiumJS 3D globe view
src/components/feed/      Live SSE event feed
src/components/marketplace/ Connector catalog gallery
src/components/settings/  API key management
src/core/                 platform internals (db, graph, stream, ai, collab, mcp, keys)
src/store/canvas.ts       Zustand canvas store (nodes, edges, persistence)
src/app/api/              REST + MCP + SSE endpoints
packages/
  seraph-graph-types/   shared canonical types
  seraph-connector-sdk/ connector authoring SDK
workers/                  BullMQ workers (connector-runner, ai-processor)
prisma/                   relational schema + AGE bootstrap
scripts/                  run CLI, deploy scripts, Cesium asset copier
services/                 per-service Railway configs
docs/                     ARCHITECTURE, CONNECTOR_GUIDE, CANVAS_SCHEMA, AI_LAYER
```

## Design principles

1. **Provenance is non-negotiable** — every entity, edge, and AI inference
   carries attribution back to its source.
2. **AI proposes, analysts decide** — nothing is committed to the graph without
   human confirmation. No silent auto-merge.
3. **The canvas is the source of truth** — every view is a lens on the canvas.
4. **Open graph schema** — documented canvas export format, no lock-in.
5. **Self-hostable with one command** — Docker Compose is the entire stack.

## License

Apache 2.0 — fork, redistribute, deploy without legal ambiguity.
