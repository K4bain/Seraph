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

## Deployment (Fly.io)

Four Fly apps + managed Redis; everything on the free tier, region `del`
(Delhi — closest to Peshawar, PK; `fra` is the fallback):

| App | Role | Config | Port |
| --- | --- | --- | --- |
| `seraph-app` | Next.js standalone server (Dockerfile, `output: "standalone"`) | `fly.toml` | 3000 (public, `/api/health` check) |
| `seraph-age` | Apache AGE Postgres, persistent 1 GB volume `age_data`, **internal-only** | `fly.age.toml` | 5432 (`seraph-age.internal`) |
| `seraph-worker` | BullMQ connector worker (`pnpm worker:connectors`) — POST /api/connectors only enqueues; without this app cron jobs would never execute | `fly.worker.toml` + `Dockerfile.worker` | none (private) |
| `seraph-collab` | Yjs WebSocket presence server (`pnpm collab:server`); sleeps on idle | `fly.collab.toml` + `Dockerfile.collab` | 3001 (public wss) |
| Upstash Redis | BullMQ queues (`REDIS_URL`, free tier) | — | external |

Key wiring:
- `GRAPH_DATABASE_URL=postgresql://postgres:<pw>@seraph-age.internal:5432/meridian` — only the app and worker hold it as a secret; `ENABLE_GRAPH_IMPORT=true`.
- `NEXT_PUBLIC_WS_SERVER_URL` is **build-time** (inlined into the client bundle) — set in `fly.toml [build.args]`; changing it requires a rebuild. `WS_SERVER_URL` (runtime, server-side) is a Fly secret.
- Cron (`.fly/cron.yml`, applied by `scripts/fly-deploy.sh` via `fly cron create`, alpine + busybox wget): keep-warm app every 5 min, keep-warm collab every 5 min, poll all 3 connectors every 30 min, graph import hourly.
- Deploy everything in order with `bash scripts/fly-deploy.sh` — creates apps/volume, deploys age → init AGE graph (idempotent DO-block wrapper; `prisma/graph/age-init.sql` stays authoritative) → worker → collab → app, sets secrets, installs cron, verifies endpoints.
- GDELT note: HTTPS to `api.gdeltproject.org` is TLS-filtered on the home network; the connector falls back to plain HTTP automatically (works fine from Fly — but keep the default `baseUrl`).

## Milestone checklist for new work

- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] No server-only imports leaked into client components
- [ ] Provenance fields preserved on all new graph writes
- [ ] New shared types live in `packages/meridian-graph-types` or the SDK
