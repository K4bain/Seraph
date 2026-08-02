# Seraph — Railway Deployment Guide

Migrating from the (dormant) Fly.io configs to Railway. Everything is
free-tier; the Fly files remain in the repo in case we switch back.

## Service map

| Service | Image / build | Config file | Port | Notes |
| --- | --- | --- | --- | --- |
| **seraph-app** | repo `Dockerfile` (Next.js standalone) | `railway.toml` (repo root) | 3000 | public HTTP, healthcheck `/api/health` |
| **seraph-age** | `Dockerfile.age` (apache/age:latest) | `services/age/railway.toml` | 5432 | private-only, persistent volume `/var/lib/postgresql/data` |
| **seraph-collab** | `Dockerfile.collab` (y-websocket server) | `services/collab/railway.toml` | 3001 | public HTTP, healthcheck `/` |
| **seraph-worker** | `Dockerfile.worker` (BullMQ consumer) | `services/worker/railway.toml` | — | private, consumes connector jobs |
| **seraph-redis** | Railway Redis plugin (free) | — | 6379 | `REDIS_URL` injected into **all** services project-wide |
| **cron-poll** | `Dockerfile.cron` (alpine + curl) | `services/cron-poll/railway.toml` | — | `cronSchedule = "*/30 * * * *"`, exits after POST |
| **cron-import** | `Dockerfile.cron` (alpine + curl) | `services/cron-import/railway.toml` | — | `cronSchedule = "0 * * * *"`, exits after POST |

Keep-warm crons are **not** needed: Railway services do not auto-sleep
(unlike Fly), so the app/collab stay up on their own.

## Prereqs

- GitHub repo `K4bain/Seraph` (private is fine — Railway needs repo access).
- Railway account (free starter plan, no card).
- Local `.env` with `DATABASE_URL` (Neon) and `OPENROUTER_API_KEY` — you
  already have both.

## Step 1 — Create project and connect GitHub

1. https://railway.com → **New Project** → **Deploy from GitHub repo**.
2. Authorize GitHub access, pick `K4bain/Seraph`.
3. Railway will start deploying a default service — **delete it** (we add
   each service with its own config). Keep the project.

## Step 2 — Redis plugin

1. In the project canvas click **+ New** → **Database** → **Redis** (free).
2. Railway generates `REDIS_URL` and injects it into **every service** in
   the project automatically. No copying needed.

## Step 3 — seraph-age (Apache AGE Postgres)

1. **New Service** → **Deploy from GitHub repo** → `K4bain/Seraph`.
2. Name it `seraph-age`.
3. Root directory: `services/age` — Railway picks up
   `services/age/railway.toml` (builder DOCKERFILE, `Dockerfile.age`).
   > If the build log shows a different Dockerfile/config being used,
   > set the service variable `RAILWAY_DOCKERFILE_PATH=Dockerfile.age`
   > instead and clear the root directory to `.`.
4. **Variables**:
   - `POSTGRES_DB=meridian`
   - `POSTGRES_USER=postgres`
   - `POSTGRES_PASSWORD=<generate a strong one, e.g. openssl rand -base64 24>`
5. **Settings → Volumes**: add a volume mounted at
   `/var/lib/postgresql/data` (persistent storage).
6. Deploy. On first boot the initdb.d hook auto-creates the AGE extension
   and the `meridian` graph (see `Dockerfile.age`).
7. Grab the connection details from **Settings → Private Networking**:
   - private hostname, e.g. `<hash>.railway.internal` on port `5432`
   - this becomes `GRAPH_DATABASE_URL` on the app and worker:
     `postgresql://postgres:<PW>@<hash>.railway.internal:5432/meridian`

> For local one-off access, enable **TCP Proxy** in Settings → Networking
> and use the public proxy URL with `scripts/railway-init-age.sh`.

## Step 4 — seraph-collab (Yjs WebSocket server)

1. **New Service** → Deploy from GitHub → `K4bain/Seraph`, name `seraph-collab`.
2. Root directory: `services/collab` (config: builder DOCKERFILE,
   `Dockerfile.collab`, start `pnpm collab:server`, healthcheck `/`).
3. Railway generates a public URL like `https://seraph-collab-production-xxxx.up.railway.app` — copy it.
4. Deploy. Confirm `curl https://<collab-url>/` returns `okay`.

## Step 5 — seraph-worker (BullMQ consumer)

1. **New Service** → Deploy from GitHub → `K4bain/Seraph`, name `seraph-worker`.
2. Root directory: `services/worker` (config: builder DOCKERFILE,
   `Dockerfile.worker`, start `pnpm worker:connectors`).
3. **Variables**:
   - `DATABASE_URL` (Neon)
   - `GRAPH_DATABASE_URL` (from Step 3)
   - `ENABLE_GRAPH_IMPORT=true`
   - `REDIS_URL` is auto-injected by the Redis plugin.
4. Deploy. It waits on the queue; jobs appear once cron-poll fires.

## Step 6 — seraph-app (main Next.js app) — deploy LAST

1. **New Service** → Deploy from GitHub → `K4bain/Seraph`, name `seraph-app`.
2. Root directory: `.` (repo root) — Railway reads the root
   `railway.toml` (builder DOCKERFILE, start `node server.js`,
   healthcheck `/api/health`).
3. **Variables** (set BEFORE the first deploy — `NEXT_PUBLIC_WS_SERVER_URL`
   is baked into the client bundle at build time; Railway injects service
   variables into Docker builds, the Dockerfile declares it as an `ARG`):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon connection string |
   | `GRAPH_DATABASE_URL` | from Step 3 |
   | `REDIS_URL` | auto-injected |
   | `OPENROUTER_API_KEY` | existing key |
   | `OPENROUTER_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` (note: `openai/gpt-oss-120b:free` returns 404 — it went paid-only; keep the free nemotron) |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `NEXTAUTH_URL` | `https://seraph-app-production-xxxx.up.railway.app` (the app's own URL) |
   | `WS_SERVER_URL` | collab URL from Step 4, with `https://` → `wss://` |
   | `NEXT_PUBLIC_WS_SERVER_URL` | same value as `WS_SERVER_URL` (build-time) |
   | `ENABLE_GRAPH_IMPORT` | `true` |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | leave empty (auth is stubbed) |

4. Deploy. The healthcheck `/api/health` must return 200.

## Step 7 — cron services

1. **cron-poll**: New Service → GitHub → `K4bain/Seraph`, root directory
   `services/cron-poll` (config: `Dockerfile.cron`, start
   `sh scripts/railway-cron-poll.sh`, schedule `*/30 * * * *`).
   Variable: `APP_URL=https://<app-url>`.
2. **cron-import**: same, root directory `services/cron-import`
   (start `sh scripts/railway-cron-import.sh`, schedule `0 * * * *`).
   Variable: `APP_URL=https://<app-url>`.
3. Railway cron minimum interval is 5 minutes; schedules are UTC. Each run
   executes the start command and the container must exit — both scripts do.

## Verification

1. `curl https://<app-url>/api/health` → 200
2. Open `<app-url>/dashboard` and `<app-url>/canvas/demo` — canvas renders.
3. `curl -X POST -H "Content-Type: application/json" -d '{"canvasId":"demo"}' https://<app-url>/api/graph/import` → 200; then query the AGE service (`SELECT * FROM ag_catalog.ag_graph;`) to see `meridian`.
4. Open a canvas in two browsers — presence list shows the collab connection (console: `ws://<collab-url>/meridian-canvas-demo` connects).
5. After the next `*/30` cron tick: `GET /api/connectors` (dashboard Status page) shows queue activity.

## Usage budget (free tier)

The starter plan allows ~500 execution hours/month **across all services**.
4 always-on services ≈ 2,880 h/month — way over. This is fine in practice
if you keep it lean:

- `seraph-age` + `seraph-app`: keep always-on (≈ 1,440 h — still over;
  Railway will **sleep services when the quota is exhausted**).
- `seraph-collab`: **Sleep** it in the dashboard when you're not actively
  collaborating (wake on demand).
- `seraph-worker`: Sleep it, and wake it manually right after a cron tick,
  OR accept that jobs queue in Redis until the worker wakes (BullMQ is
  durable — nothing is lost).
- cron services only burn minutes while executing.

If you'd rather not manage sleep manually, the paid Hobby plan removes the
hour cap.

## Troubleshooting

- **Wrong Dockerfile used in a build**: set the service variable
  `RAILWAY_DOCKERFILE_PATH=Dockerfile.<name>` (root directory `.`).
- **Config-as-code not applied**: the build log prints
  `config-as-code path set as ...` — if missing, set the service's root
  directory to the matching `services/<name>` path and redeploy.
- **NEXT_PUBLIC_WS_SERVER_URL stale**: it is inlined at build time —
  change it in Variables, then **redeploy** (Settings → Redeploy).
- **Collab won't connect**: check `WS_SERVER_URL` is `wss://` and the
  collab service is awake; the server logs each connection.
- **GRAPH_DATABASE_URL refused**: verify you used the private
  `railway.internal` hostname for app/worker (public proxy only for local
  psql) and the password matches `POSTGRES_PASSWORD`.

## Fly.io leftovers

The Fly.io configs (`fly.toml`, `fly.age.toml`, `fly.worker.toml`,
`fly.collab.toml`, `Dockerfile.worker`, `Dockerfile.collab`,
`Dockerfile.age`-predecessor `scripts/fly-deploy.sh`, `.fly/cron.yml`)
are retained, unmodified, in case we switch back. Do not run
`scripts/fly-deploy.sh` — it targets the old Fly apps.
