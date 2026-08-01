# Meridian

Open-source intelligence fusion platform. Graph-first, AI-native investigation
canvases for OSINT researchers, journalists, and analysts.

Palantir sells you a black box. **Meridian** gives you the engine room: ingest
heterogeneous public data streams, surface relationships, anomalies, and
narratives, and build shareable investigation canvases where every entity is a
node, every relationship is an edge, and every insight is a version-controlled
object.

**Status:** v0.1 — Phase 1 foundation + Phase 2 canvas persistence (snapshot
autosave, edge inspector, inline card editing). Realtime presence (Yjs) and
connectors land in later phases.

## Quickstart

```bash
# 1. Database — self-hosted (PostgreSQL + Apache AGE, Redis, MinIO)
docker compose up -d

#    …or serverless Postgres (no AGE graph): set DATABASE_URL in .env
#    (see .env.example). Meridian uses the Neon HTTP driver via
#    @prisma/adapter-neon.

# 2. Install + relational schema
pnpm install          # runs prisma generate (postinstall)
pnpm db:push

# 3. Seed demo data (optional)
pnpm db:seed

# 4. Run
pnpm dev          # → http://localhost:3000 (canvas at /canvas/demo)
```

The `meridian` AGE graph is created automatically on first volume init from
`prisma/graph/age-init.sql`. Workers (optional, need Redis): `pnpm
worker:connectors`, `pnpm worker:ai`.

## Repository map

```
src/app/                  App Router routes — server components by default
src/components/canvas/    React Flow nodes/edges + inspector UI
src/core/                 platform internals (db, graph, stream, ai, collab)
src/store/canvas.ts       Zustand canvas store (nodes, edges, persistence)
src/app/api/canvas/       snapshot persistence API (versioned, optimistic)
packages/
  meridian-graph-types/   shared canonical types
  meridian-connector-sdk/ connector authoring SDK
workers/                  BullMQ workers
prisma/                   relational schema + AGE bootstrap
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
