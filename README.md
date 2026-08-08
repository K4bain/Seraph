# Seraph

**Find anyone. Map everything. Stay informed.**

Search-first OSINT workspace. Ask one question, get answers from six opensource
databases at once — OpenSanctions watchlists, SEC EDGAR filings, GDELT news,
Wikidata, WHOIS, and GitHub — then pull anything interesting into a graph canvas
of intelligence cards and relationships.

Palantir sells you a black box. **Seraph** gives you the engine room: ingest
heterogeneous public data streams, surface relationships, anomalies, and
narratives, and build shareable investigation canvases where every entity is a
node, every relationship is an edge, and every insight is a version-controlled
object.

## The three pillars

1. **Search everything.** One query fans out across OpenSanctions, SEC EDGAR,
   GDELT, Wikidata, WHOIS, and GitHub — with per-source filtering, an AI
   summary of the results, and one-click "Add to Canvas" ingestion that lands
   cards plus proposed edges.
2. **Monitor what matters.** A live feed of world events (GDELT), market
   signals (Yahoo Finance quotes, sparklines, top movers), and a watchlist the
   poll worker sweeps every 30 minutes, surfacing new mentions as alerts.
3. **Map the connections.** Every hit opens an entity profile with a timeline
   and a relationship graph; canvases are the source of truth — timeline, geo,
   and 3D-globe lenses over the same data, with AI-proposed edges awaiting
   analyst confirmation.

**Status:** v0.1 — all core phases complete. Search + landing page, entity
profiles, live feed (events / markets / watchlist), canvas persistence
(snapshot autosave, edge inspector, inline card editing), realtime presence
(Yjs cursors/selection), connector runtime (OpenSanctions, GDELT DOC API, SEC
EDGAR) with BullMQ workers, AGE graph import bridge, AI extraction/inference
via OpenRouter (function calling, proposed edges), timeline + geo lenses
(Leaflet), 3D globe (CesiumJS), client-side PDF export (jsPDF), JSON snapshot
export, token-based shareable links, MCP endpoint (`/api/mcp`), live SSE feed,
and a connector marketplace gallery. Deployed to Railway.

## Quickstart

```bash
# 1. Environment — copy .env.example and set DATABASE_URL (+ REDIS_URL,
#    OPENROUTER_API_KEY optional). Serverless Postgres (Neon) is the default
#    driver via @prisma/adapter-neon; docker compose up -d also works for a
#    full self-hosted stack (PostgreSQL + Apache AGE, Redis, MinIO).

# 2. Install + relational schema
pnpm install          # runs prisma generate (postinstall)
pnpm db:push

# 3. Seed demo data (optional)
pnpm db:seed

# 4. Run
pnpm dev          # → http://localhost:3000 (search landing at /)

# 5. Background services (need Redis)
pnpm worker:connectors   # connector runs + 30-min watchlist poll
pnpm worker:ai           # AI extraction / edge inference

# 6. Realtime presence (optional — Yjs cursors, selection)
pnpm collab:server   # in-memory WS server, default ws://localhost:3001
```

The `seraph` AGE graph is created automatically on first volume init from
`prisma/graph/age-init.sql` and populated via the import bridge
(`ENABLE_GRAPH_IMPORT=true`, `POST /api/graph/import`).

## Repository map

```
src/app/                  App Router routes — server components by default
src/app/(app)/            App shell pages (search, feed, entity, canvas, …)
src/components/landing/   Search landing page (hero, stat cards)
src/components/search/    Search results + AI summary + add-to-canvas
src/components/entity/    Entity profile (Overview/Timeline/Connections/Canvases)
src/components/feed/      Live feed tabs (world events, markets, watchlist)
src/components/canvas/    React Flow nodes/edges + inspector + AI panel + export
src/components/geo/       Leaflet map view
src/components/globe/     CesiumJS 3D globe view
src/components/layout/    App shell (sidebar, top search, mobile tab bar)
src/components/marketplace/ Connector catalog gallery
src/components/settings/  API key management
src/core/                 platform internals (db, graph, stream, ai, collab, mcp, keys)
src/core/search/          shared search fan-out (run.ts)
src/core/entity/          entity profile/connections/timeline (profile.ts)
src/core/feed/            world events, markets, watchlist polling
src/store/canvas.ts       Zustand canvas store (nodes, edges, persistence)
src/app/api/              REST + MCP + SSE endpoints
packages/
  seraph-graph-types/   shared canonical types
  seraph-connector-sdk/ connector authoring SDK
workers/                  BullMQ workers (connector-runner + watchlist, ai-processor)
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

## Live deployment (handoff doc)

> Keep this section updated while you work — it is how the next session picks
> up where you left off.

**Railway** (`observant-determination`, env `production`): app
`seraph-production-ab66.up.railway.app`, AGE `seraph-age`, collab WS,
connector worker (COPY-based Dockerfile, consumes `seraph-connectors` +
`seraph-watchlist`), cron-poll + cron-import services. See
`scripts/railway-deploy.md` and CLAUDE.md for wiring and the worker
build-cache pitfall (never reintroduce build-time `git clone` in a Railway
Dockerfile).

**Verified in this build-out session:** search fan-out across all six
connectors, streaming AI summary, add-to-canvas ingestion, entity profiles
with timeline + connection graph, feed tabs (world events via GDELT DOC,
markets via Yahoo Finance, watchlist CRUD), watchlist poll end-to-end
(50 alerts, dedup, per-item error isolation), nav restructure (top search +
mobile tab bar), typecheck + lint green.

**Next steps (in order):** final gates — `pnpm lint`, `pnpm build`, browser
checklist (landing, search, entity, feed, add-to-canvas, mobile tab bar,
Seraph branding consistent across UI), commit + push, Railway redeploy; then
resume any work appended below.

## Status / roadmap (corrected vision scorecard)

External review claimed the following were missing. Audit against
`master` (`430a82c feat(search): search-first OSINT buildout`) plus a live
smoke test of https://seraph-production-ab66.up.railway.app:

| Item | State | Evidence |
| --- | --- | --- |
| Search landing page | DONE | `/` renders `src/components/landing/SearchLanding.tsx` via `src/app/page.tsx` |
| Search results page | DONE | `src/app/(app)/search/page.tsx` + `src/components/search/SearchResults.tsx`, fan-out via `/api/search` |
| Entity profile page | DONE | `src/app/(app)/entity/[id]/page.tsx` + `src/components/entity/EntityProfile.tsx` (Overview/Timeline/Connections/Canvases) |
| Live feed | DONE | `/feed` (`src/app/(app)/feed/page.tsx` + `FeedTabs`) — World Events tab via `/api/feed/events` |
| Markets tab | DONE | `FeedTabs` Markets tab + `/api/feed/markets` (indices, crypto, movers) |
| Watchlist | DONE | `FeedTabs` Watchlist tab + `/api/watchlist` + `/api/watchlist/alerts/[id]/read` |
| IMINT image analysis | IN PROGRESS | not in `src/connectors/` yet — another worker is building it |
| Whatsmyname connector | IN PROGRESS | not in `src/connectors/` yet — another worker is building it |
| GitHub user search connector | DONE | `src/connectors/github/connector.ts`, registered in `src/connectors/index.ts` |
| Wikidata connector | DONE | `src/connectors/wikidata/connector.ts`, registered in `src/connectors/index.ts` |
| WHOIS connector | DONE | `src/connectors/whois/connector.ts`, registered in `src/connectors/index.ts` |
| Navigation restructure | DONE | `AppSidebar` + `MobileTabBar` in `src/components/layout/`; search-first shell in `(app)/layout.tsx` |
| README rewrite | DONE | Seraph search-first OSINT pitch (this file); no Meridian branding left |

### Geolocate

Image-geolocation via a CLIP + FAISS microservice. The Next.js app exposes a
proxy endpoint; the actual embedding/search happens in the
`services/geolocate` microservice.

#### POST /api/geolocate (Next.js proxy)

Proxies a multipart upload to the geolocate microservice and returns the
service JSON verbatim.

Response envelope is the service's JSON (`query_hash`, `candidates`, optional
`hint` when the index is empty). Errors: `400` for missing/invalid input,
`502` with `code: "GEO_UNAVAILABLE"` when the microservice is unreachable or
times out.

#### Environment

| Var | Default | Purpose |
| --- | --- | --- |
| `GEOLOCATE_URL` | `http://localhost:8000/geolocate` | base URL of the geolocate microservice endpoint |
| `GEOLOCATE_TIMEOUT_MS` | `12000` | per-request upstream timeout in milliseconds |

#### services/geolocate microservice

FastAPI app (`services/geolocate/app/api.py`): `POST /geolocate` embeds the
image with CLIP (`transformers`, `openai/clip-vit-base-patch32`) and runs a
FAISS `IndexFlatIP(d=512)` nearest-neighbor search for lat/lon candidates.
Data lives at `INDEX_PATH` (`data/index.faiss`) and `META_PATH`
(`data/meta.json`). `/health` reports liveness + index entry count.

Build the index (on a machine with torch + RAM for the model):

```bash
cd services/geolocate
python scripts/build_index.py --meta sample_meta.csv
# writes data/index.faiss, data/meta.json, data/manifest.json
```

`bash scripts/build_data.sh` seeds ~5 public Wikimedia landmark images.
Index files are gitignored / dockerignored and built at runtime.

#### CI gate

The dev box OOMs on `next build` (cgroup limited to ~7.7GB shared memory), so
the full build gate runs in GitHub Actions instead — `.github/workflows/ci.yml`
runs on push to `master` and on pull requests: frozen-lockfile pnpm install,
lint, typecheck, tests, and a production build on `ubuntu-latest`.

**Production smoke test** (2026-08-05): `/` 200 · `/search` 200 · `/feed` 200 ·
`/api/health` 200 · `/api/feed/events` 200 · `/api/feed/markets` 200 ·
`/api/watchlist` 200 · `/entity/1` 200.

## License

Apache 2.0 — fork, redistribute, deploy without legal ambiguity.
