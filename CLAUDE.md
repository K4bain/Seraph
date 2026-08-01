# CLAUDE.md — instructions for Claude Code (and other agents)

## Project

**Meridian** — open-source intelligence fusion platform. Graph-first, AI-native
investigation canvases for OSINT researchers, journalists, and analysts.

- License: Apache 2.0
- Status: v0.1 (Phase 1 foundation scaffold)
- Full product brief: the repository README + `docs/`

## Stack (do not swap without a design discussion)

- **App**: Next.js 15 (App Router), TypeScript 5 strict, single app at repo root
- **Canvas**: React Flow v12 (`@xyflow/react`), custom node types, Zustand + Immer store
- **Styling**: plain CSS Modules (`.module.css`). **No Tailwind, no CSS-in-JS.**
- **Graph DB**: Apache AGE (property graph) on PostgreSQL, via `src/core/graph/age.ts`
- **Relational**: Prisma 7 (`prisma-client` generator → `src/generated/prisma`), `prisma.config.ts`
- **Queues**: BullMQ + Redis (`workers/`)
- **Realtime**: Yjs collab lands in Phase 2 (`src/core/collab/`)
- **AI**: Anthropic API via `src/core/ai/client.ts` (server-only)
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
  ai/                     Anthropic client (client.ts), tasks land in Phase 4
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
5. **Server-only discipline.** `pg`, `@anthropic-ai`, Prisma client, and the AGE
   client must never be imported from a client component. If a module uses
   `process.env` at import time it is server-only.
6. **Shared types come from packages**, never duplicated in `src/`.
7. **CSS Modules with the global token set** in `src/app/globals.css` (CSS
   variables: `--bg`, `--panel`, `--border`, `--accent`, ...). Dark, instrument-
   panel aesthetic; mono for data; hairline borders.
8. **pnpm workspaces.** New shared code → a package in `packages/` with
   `main/types` pointing at `src/index.ts`. App consumes via transpilePackages.

## Phase plan (v0.1)

- Phase 1 (done): monorepo, schema, AGE bootstrap, auth stub, canvas shell
- Phase 2: full card types, edges + annotation UI, persistence, Yjs presence
- Phase 3: connector SDK runtime, EventBus + BullMQ wiring, OpenSanctions/GDELT/EDGAR
- Phase 4: AI layer — extraction, edge inference, anomaly flags, narrative, NL query
- Phase 5: timeline, geo (Leaflet), PDF/JSON export, shareable links

## Milestone checklist for new work

- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] No server-only imports leaked into client components
- [ ] Provenance fields preserved on all new graph writes
- [ ] New shared types live in `packages/meridian-graph-types` or the SDK
