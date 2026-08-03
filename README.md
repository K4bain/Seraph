# Seraph

Search-first OSINT workspace. Ask one question, get answers from six opensource
databases at once — OpenSanctions watchlists, SEC EDGAR filings, GDELT news,
Wikidata, WHOIS, and GitHub — then pull anything interesting into a graph canvas
of intelligence cards and relationships.

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

## Current status + next steps (live handoff doc)

> Keep this section updated before you start, while you work, and when you
> stop — it is how the next AI session picks up where you left off.

**Live deployment (Railway `observant-determination`, env `production`):**
- App `seraph-production-ab66.up.railway.app`, AGE `seraph-age` (AGE graph DB
  `seraph`, AGE 1.7.0, 115 entities imported), collab WS, connector worker.
- Verified this session: `POST /api/graph/import` (115 entities → AGE),
  MCP `/api/mcp` with an API key (initialize, list_canvases, get_canvas,
  query_graph returning real AGtype rows), SSE `/api/events` (hello +
  `redis:true`), connector queue drained by the rebuilt worker.
- **Worker bug fixed this session:** the old worker image was a build-time
  `git clone` layer-cached at pre-rename code → consumed the dead
  `meridian-connectors` queue forever. `Dockerfile.worker` is now COPY-based
  (context = repo root); the service instance is `rootDirectory:"."` +
  `railwayConfigFile:"services/worker/railway.toml"` (set via
  `serviceInstanceUpdate`). Do NOT reintroduce build-time `git clone` in any
  Railway Dockerfile (see ops notes in CLAUDE.md / `scripts/railway-deploy.md`).

**Next steps (in order):**
1. Browser E2E of the live site below (chrome-devtools: `/`, `/canvas/demo`,
   `/feed`, `/marketplace`, `/timeline`, `/geo`, `/globe` (WebGL), `/share/*`,
   `/settings` API-key flow) — catch console errors / blank panels.
2. GDELT 429 mitigation (optional, ~low value): stagger cron-poll bursts so
   `api.gdeltproject.org` 1-req/5s per-IP limit isn't hit (jobs fail
   `RateLimitedError` under back-to-back runs; retry w/ backoff already in the
   connector).
3. AI worker WIP (currently UNCOMMITTED in the working tree, do not revert):
   `workers/ai-processor.ts`, `src/core/ai/tasks/{anomalies.ts,briefing.ts}`,
   `src/app/api/ai/{anomalies,briefing}/`, `src/core/canvas.ts` — finish,
   `pnpm typecheck` + `pnpm lint`, commit, deploy (worker image auto-rebuilds,
   then `pnpm worker:ai` consumes `seraph-ai`).
4. Any new work landed by the next agent — append to this list before starting.

**Verification one-liners (after any deploy):** see CLAUDE.md "Commands" +
`scripts/railway-deploy.md`; queue drain check via BullMQ against the Upstash
`REDIS_URL` (blocking-commands work; keep `maxRetriesPerRequest: null`).

## License

Apache 2.0 — fork, redistribute, deploy without legal ambiguity.
