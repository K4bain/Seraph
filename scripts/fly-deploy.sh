#!/usr/bin/env bash
# ================================================================
# Meridian — one-shot Fly.io deploy: AGE Postgres, worker, collab,
# main app, secrets, AGE init, cron jobs, verification.
#
# Prereqs:
#   - flyctl installed (https://fly.io/docs/flyctl/install/) and logged in
#   - .env populated with DATABASE_URL (Neon), REDIS_URL (Upstash),
#     OPENROUTER_API_KEY (real secrets are read from .env; never committed)
#
# Usage: bash scripts/fly-deploy.sh [--skip-cron]
# ================================================================
set -euo pipefail

REGION="${FLY_REGION:-del}"   # closest to Peshawar, PK; fallback "fra"
AGE_PG_PASSWORD="${AGE_PG_PASSWORD:-password}"

require() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; exit 1; }; }
require flyctl
require openssl

if [ -z "${DATABASE_URL:-}" ] && [ ! -f .env ]; then
  echo "error: .env not found and DATABASE_URL not exported — populate .env first"
  exit 1
fi

# Load .env (without clobbering already-exported vars).
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

echo "==> Region: $REGION (set FLY_REGION to override)"

# ---------------------------------------------------------------
# App 2 — seraph-age (Apache AGE Postgres, private + persistent)
# ---------------------------------------------------------------
echo "==> [1/7] seraph-age (AGE Postgres)"
if ! fly apps show seraph-age >/dev/null 2>&1; then
  fly apps create seraph-age --machines --name seraph-age
fi
if ! fly volumes list -a seraph-age | grep -q age_data; then
  echo "    creating age_data volume (1GB)..."
  fly volumes create age_data -a seraph-age --size 1 --region "$REGION"
fi
fly deploy -c fly.age.toml -a seraph-age --region "$REGION" --yes
echo "    waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if fly ssh console -a seraph-age -C "pg_isready -U postgres -d meridian" 2>/dev/null | grep -q accepting; then
    break
  fi
  sleep 5
done

# ---------------------------------------------------------------
# AGE bootstrap (idempotent — safe to re-run)
# ---------------------------------------------------------------
echo "==> [2/7] AGE graph init on seraph-age"
fly ssh console -a seraph-age -C "psql -U postgres -d meridian -c \"CREATE EXTENSION IF NOT EXISTS age; LOAD 'age'; DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'meridian') THEN PERFORM ag_catalog.create_graph('meridian'); END IF; END \\\$\\\$;\"" || {
  echo "    psql init failed — try manually:"
  echo "    fly ssh console -a seraph-age -C \"psql -U postgres -d meridian -f -\" < prisma/graph/age-init.sql"
}

# ---------------------------------------------------------------
# App 4 (addition) — seraph-worker (BullMQ connector worker)
# ---------------------------------------------------------------
echo "==> [3/7] seraph-worker (BullMQ connector worker)"
if ! fly apps show seraph-worker >/dev/null 2>&1; then
  fly apps create seraph-worker --machines --name seraph-worker
fi
fly secrets set -a seraph-worker \
  "DATABASE_URL=$DATABASE_URL" \
  "REDIS_URL=$REDIS_URL" \
  "GRAPH_DATABASE_URL=postgresql://postgres:${AGE_PG_PASSWORD}@seraph-age.internal:5432/meridian" \
  "ENABLE_GRAPH_IMPORT=true"
fly deploy -c fly.worker.toml -a seraph-worker --region "$REGION" --yes

# ---------------------------------------------------------------
# App 3 — seraph-collab (Yjs WebSocket server)
# ---------------------------------------------------------------
echo "==> [4/7] seraph-collab (Yjs WebSocket server)"
if ! fly apps show seraph-collab >/dev/null 2>&1; then
  fly apps create seraph-collab --machines --name seraph-collab
fi
fly deploy -c fly.collab.toml -a seraph-collab --region "$REGION" --yes

# ---------------------------------------------------------------
# App 1 — seraph-app (main Next.js app) + secrets
# ---------------------------------------------------------------
echo "==> [5/7] seraph-app (main app)"
if ! fly apps show seraph-app >/dev/null 2>&1; then
  fly apps create seraph-app --machines --name seraph-app
fi

# Real secrets from .env; everything from .env.example is covered.
AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -hex 32)}"
fly secrets set -a seraph-app \
  "DATABASE_URL=$DATABASE_URL" \
  "GRAPH_DATABASE_URL=postgresql://postgres:${AGE_PG_PASSWORD}@seraph-age.internal:5432/meridian" \
  "REDIS_URL=$REDIS_URL" \
  "OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}" \
  "OPENROUTER_MODEL=${OPENROUTER_MODEL:-openai/gpt-oss-120b:free}" \
  "ANTHROPIC_API_KEY=" \
  "AUTH_SECRET=$AUTH_SECRET" \
  "NEXTAUTH_URL=https://seraph-app.fly.dev" \
  "WS_SERVER_URL=wss://seraph-collab.fly.dev" \
  "ENABLE_GRAPH_IMPORT=true" \
  "AUTH_GOOGLE_ID=${AUTH_GOOGLE_ID:-}" \
  "AUTH_GOOGLE_SECRET=${AUTH_GOOGLE_SECRET:-}" \
  "VOYAGE_API_KEY=${VOYAGE_API_KEY:-}" \
  "S3_ENDPOINT=${S3_ENDPOINT:-}" \
  "S3_ACCESS_KEY=${S3_ACCESS_KEY:-}" \
  "S3_SECRET_KEY=${S3_SECRET_KEY:-}" \
  "S3_BUCKET=${S3_BUCKET:-}" \
  "S3_USE_SSL=${S3_USE_SSL:-false}"

fly deploy -c fly.toml -a seraph-app --region "$REGION" --yes

# ---------------------------------------------------------------
# Cron jobs (keep-warm x2, connector polling, graph import)
# ---------------------------------------------------------------
if [ "${1:-}" != "--skip-cron" ]; then
  echo "==> [6/7] Fly machine cron jobs"
  create_cron() {
    if ! fly cron create "$1" "$2" --app seraph-app --image alpine:3.20 --region "$REGION" --name "$3"; then
      echo "    cron '$3' failed (may already exist) — check: fly cron list -a seraph-app"
    fi
  }
  create_cron "*/5 * * * *" "wget -qO- --spider https://seraph-app.fly.dev/api/health" keep-warm-app
  create_cron "*/5 * * * *" "wget -qO- --spider https://seraph-collab.fly.dev" keep-warm-collab
  create_cron "*/30 * * * *" "wget -qO- --post-data='{\"connectorId\":\"gdelt\",\"canvasId\":\"demo\"}' --header='Content-Type: application/json' https://seraph-app.fly.dev/api/connectors; wget -qO- --post-data='{\"connectorId\":\"opensanctions\",\"canvasId\":\"demo\"}' --header='Content-Type: application/json' https://seraph-app.fly.dev/api/connectors; wget -qO- --post-data='{\"connectorId\":\"edgar\",\"canvasId\":\"demo\"}' --header='Content-Type: application/json' https://seraph-app.fly.dev/api/connectors" poll-connectors
  create_cron "0 * * * *" "wget -qO- --post-data='{\"canvasId\":\"demo\"}' --header='Content-Type: application/json' https://seraph-app.fly.dev/api/graph/import" graph-import
else
  echo "==> [6/7] cron skipped (--skip-cron)"
fi

# ---------------------------------------------------------------
# Verification
# ---------------------------------------------------------------
echo "==> [7/7] verification"
echo -n "  https://seraph-app.fly.dev/api/health            → "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 https://seraph-app.fly.dev/api/health || echo "unreachable"
echo -n "  https://seraph-app.fly.dev/dashboard             → "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 https://seraph-app.fly.dev/dashboard || echo "unreachable"
echo -n "  https://seraph-app.fly.dev/canvas/demo           → "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 https://seraph-app.fly.dev/canvas/demo || echo "unreachable"
echo -n "  GET /api/graph/import (AGE availability)         → "
curl -s --max-time 30 https://seraph-app.fly.dev/api/graph/import || echo "unreachable"; echo
echo -n "  https://seraph-collab.fly.dev/                   → "
curl -s --max-time 30 https://seraph-collab.fly.dev/ || echo "unreachable"; echo

echo
echo "Done. Manual checks:"
echo "  1. POST /api/graph/import -d '{\"canvasId\":\"demo\"}'   (verify 200)"
echo "  2. Open a canvas — presence list should show a collab connection"
echo "  3. Upstash console — connector jobs appear every 30 min"
