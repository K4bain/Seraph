# CLAUDE.md — instructions for Claude Code (and other agents)

## Project

**Meridian** — open-source intelligence fusion platform. Graph-first, AI-native
investigation canvases for OSINT researchers, journalists, and analysts.

- License: Apache 2.0
- Status: v0.1 (Phases 1–3 + 5 complete; Phase 4 AI layer parked)
- Full product brief: the repository README + `docs/`

## Stack (do not swap without a design discussion)

- **App**: Next.js 15 (App Router), TypeScript 5 strict, single app at repo root
- **Canvas**: React Flow v12 (`@xyflow/react`), custom node types, Zustand + Immer store
- **Styling**: plain CSS Modules (`.module.css`). **No Tailwind, no CSS-in-JS.**
- **Graph DB**: Apache AGE (property graph) on PostgreSQL, via `src/core/graph/age.ts`
- **Relational**: Prisma 7 (`prisma-client` generator → `src/generated/prisma`), `prisma.config.ts`
- **Queues**: BullMQ + Redis (`workers/`)
- **Realtime**: Yjs collab lands in Phase 2 (`src/core/collab/`)
- **AI**: OpenRouter API via `src/core/ai/client.ts` (server-only)
- **Package manager**: pnpm workspaces (`packages/*`)

## Commands

```bash
pnpm dev              # Next.js dev server on :3000
pnpm typecheck        # tsc --noEmit (whole monorepo, incl. packages + workers)
pnpm lint             # eslint flat config
pnpm build            # production build
pnpm db:generate      # Prisma client generation
pnpm db:push          # push relational schema (dev)
pnpm db:seed          # demo user/workspace/canvas
pnpm worker:connectors  # BullMQ connector runner (needs Redis up)
pnpm worker:ai          # BullMQ AI processor (needs Redis up)
pnpm collab:server      # y-websocket in-memory presence server (ws://localhost:3001)
```

Typecheck **must** pass before considering a change done. Run `pnpm lint` too.

## Architecture map

```
src/app/                  routes (App Router) — server components by default
src/components/           canvas/ (React Flow nodes), layout/, panels (later)
src/core/                 platform internals — server-only unless marked otherwise
  db.ts                   Prisma singleton (NEVER import in client components)
  stream/                 EventBus + EntityStream types
  graph/                  AGE client (age.ts), dedup fingerprints (dedup.ts)
  ai/                     OpenRouter client (client.ts), tasks land in Phase 4
  collab/                 presence/collab stubs (Phase 2)
src/store/canvas.ts       Zustand canvas store (nodes, edges, actions)
packages/
  meridian-graph-types/   canonical entity/edge/card types — single source of truth
  meridian-connector-sdk/ public SDK: ConnectorManifest, EntityStreamEvent, defineConnector
workers/                  BullMQ workers (connector-runner, ai-processor)
prisma/                   schema.prisma + graph/age-init.sql (AGE bootstrap)
docs/                     ARCHITECTURE, CONNECTOR_GUIDE, CANVAS_SCHEMA, AI_LAYER
```

## Conventions

1. **Strict TypeScript everywhere.** `strict`, `noUncheckedIndexedAccess`,
   `noUnusedLocals/Parameters` are on. Prefer explicit types over `any`.
2. **Comments are intentional.** Write them when they explain *why* (design
   rationale, phase TODO). Do not restate code.
3. **Provenance is non-negotiable.** Every entity, edge, and AI inference must
   carry source attribution (`SourceRef` / `Provenance`). Never drop it.
4. **AI proposes, analysts decide.** Never auto-merge entities or auto-commit
   AI edges — write them as `proposed: true` and require confirmation.
5. **Server-only discipline.** `pg`, Prisma client, and the AGE
   client must never be imported from a client component. If a module uses
   `process.env` at import time it is server-only.
6. **Shared types come from packages**, never duplicated in `src/`.
7. **CSS Modules with the global token set** in `src/app/globals.css` (CSS
   variables: `--bg`, `--panel`, `--border`, `--accent`, ...). Dark, instrument-
   panel aesthetic; mono for data; hairline borders.
8. **pnpm workspaces.** New shared code → a package in `packages/` with
   `main/types` pointing at `src/index.ts`. App consumes via transpilePackages.
9. **Check skills first — always.** Before starting any task, check the
   available skills (the `skill` tool) and load a matching one if present.
   Never begin work without that check.

## Phase plan (v0.1)

- Phase 1 (done): monorepo, schema, AGE bootstrap, auth stub, canvas shell
- Phase 2 (done): full card types, edges + annotation UI, persistence, Yjs presence
- Phase 3 (done): connector SDK runtime, BullMQ wiring, OpenSanctions/GDELT/EDGAR
  → live connectors + canvas ingestion engine + `/api/connectors` + run CLI +
  status dashboard (live queue/job/canvas stats) + run-from-UI page.
  Verified against Upstash Redis (`rediss://` URL in REDIS_URL) — queue,
  worker, job logs, dedup all confirmed. GDELT verified live: HTTPS to
  `api.gdeltproject.org` is TLS-filtered on this network, so the connector
  auto-falls back to plain HTTP and retries with backoff on the API's
  per-IP rate limit (1 req / 5 s); OR'd terms in queries must be wrapped in
  parens: `("a" OR "b")`. AGE graph import bridge shipped:
  `importCanvasToGraph()` writes confirmed entities/edges into the AGE
  property graph via idempotent MERGE, gated by `ENABLE_GRAPH_IMPORT=true`,
  with a `POST /api/graph/import` route for manual triggering.
- Phase 4 (done): AI layer — extraction + edge inference runs through
  OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`) via
  `src/core/ai/client.ts` (OpenAI-compatible function calling),
  `src/core/ai/tasks/analyze.ts`, /api/ai/analyze + /api/ai/apply, canvas
  "AI" panel. Verified end-to-end with `nvidia/nemotron-3-super-120b-a12b:free`:
  analyze → apply → 13 cards created, 4 proposed edges (8 duplicate edges
  skipped by the ingest dedup). Client falls back to instruction-only
  structured output when a provider can't enforce `tool_choice`.
- Phase 5 (done): timeline, geo (Leaflet), PDF + JSON export, shareable links.
  Timeline + geo pages accept `?canvas=` query param (default: demo). PDF
  export is client-side via jsPDF (reads live canvas store state). Share
  links are token-capability read-only views at `/share/[token]`.

## Deployment (Railway)

Railway free tier (no card). One project, services deployed from the same
GitHub repo; config-as-code per service (root dir picks up the matching
`railway.toml`; `dockerfilePath` resolves relative to the repo root). Full
step-by-step: `scripts/railway-deploy.md`.

| Service | Build | Config | Port | Notes |
| --- | --- | --- | --- | --- |
| `seraph-app` | repo `Dockerfile` (standalone) | `railway.toml` (root) | 3000 | public, healthcheck `/api/health`, start `node server.js` |
| `seraph-age` | `Dockerfile.age` (apache/age:latest) | `services/age/railway.toml` | 5432 | private-only; volume `/var/lib/postgresql/data`; AGE auto-inited via initdb.d on first boot |
| `seraph-collab` | `Dockerfile.collab` | `services/collab/railway.toml` | 3001 | public, healthcheck `/`, start `pnpm collab:server` |
| `seraph-worker` | `Dockerfile.worker` | `services/worker/railway.toml` | — | BullMQ consumer, start `pnpm worker:connectors` |
| Redis | Railway plugin (free) | — | 6379 | `REDIS_URL` auto-injected into all services |
| `cron-poll` | `Dockerfile.cron` (alpine+curl) | `services/cron-poll/railway.toml` | — | `*/30 * * * *`, `sh scripts/railway-cron-poll.sh` (POSTs 3 connectors) |
| `cron-import` | `Dockerfile.cron` | `services/cron-import/railway.toml` | — | hourly, `sh scripts/railway-cron-import.sh` (POST /api/graph/import) |

Key wiring:
- Private inter-service DNS: `<service>.railway.internal` — used for
  `GRAPH_DATABASE_URL=postgresql://postgres:<pw>@<hash>.railway.internal:5432/meridian`
  on app + worker. TCP Proxy only for local psql one-offs
  (`scripts/railway-init-age.sh` is the AGE bootstrap fallback; the
  `Dockerfile.age` initdb.d hook handles fresh volumes automatically).
- `NEXT_PUBLIC_WS_SERVER_URL` is inlined into the client bundle at build
  time; Railway injects service variables into Docker builds and the
  Dockerfile declares it as `ARG` — set it (plus `WS_SERVER_URL` with
  `https`→`wss`) before the app's first build; changing it requires a
  redeploy. Deploy collab before the app.
- Railway cron = service with `deploy.cronSchedule`; its start command must
  exit when done (min interval 5 min, UTC). No keep-warm crons — Railway
  services don't auto-sleep.
- Free tier ~500 h/month execution across all services: keep app+age
  always-on, sleep collab/worker when unused; BullMQ queues are durable so
  a sleeping worker just drains late.
- Fallback if config-as-code isn't picked up: service variable
  `RAILWAY_DOCKERFILE_PATH=Dockerfile.<name>` with root directory `.`.
- Fly.io configs (`fly*.toml`, `scripts/fly-deploy.sh`, `.fly/cron.yml`)
  are retained dormant in case we switch back — do not run the Fly script.

## Milestone checklist for new work

- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] No server-only imports leaked into client components
- [ ] Provenance fields preserved on all new graph writes
- [ ] New shared types live in `packages/meridian-graph-types` or the SDK
