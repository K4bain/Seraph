#!/usr/bin/env bash
# ================================================================
# Meridian — idempotent Apache AGE bootstrap for the Railway AGE
# service. The Dockerfile.age container auto-initializes AGE on
# first boot (docker-entrypoint-initdb.d); this script is the
# fallback for volumes that predate the init hook, and for
# verifying the graph exists.
#
# Usage (run from the repo root):
#   bash scripts/railway-init-age.sh "postgresql://postgres:PW@HOST:PORT/meridian"
#   RAILWAY_AGE_URL="postgresql://..." bash scripts/railway-init-age.sh
#
# Reachability: the private <service>.railway.internal hostname
# resolves only inside Railway's network. From your laptop, enable
# TCP Proxy on the AGE service and use the public proxy URL instead.
# ================================================================
set -euo pipefail

URL="${1:-${RAILWAY_AGE_URL:-}}"
if [ -z "$URL" ]; then
  echo "error: pass the Postgres URL as \$1 or set RAILWAY_AGE_URL"
  exit 1
fi

SQL="$(cd "$(dirname "$0")/.." && pwd)/prisma/graph/age-init.sql"
if [ ! -f "$SQL" ]; then
  echo "error: $SQL not found (run from the repo root)"
  exit 1
fi

run_sql() { # $1 = psql command prefix
  "$@" -v ON_ERROR_STOP=1 -f "$SQL"
}

if command -v psql >/dev/null 2>&1; then
  echo "==> bootstrapping AGE graph (psql) on $URL"
  run_sql psql "$URL"
elif command -v docker >/dev/null 2>&1; then
  echo "==> bootstrapping AGE graph (docker one-shot) on $URL"
  docker run --rm -i postgres:16-alpine psql "$URL" -v ON_ERROR_STOP=1 < "$SQL"
else
  echo "error: need psql or docker on PATH"
  exit 1
fi

echo "==> graphs present:"
if command -v psql >/dev/null 2>&1; then
  psql "$URL" -tAc "SELECT name FROM ag_catalog.ag_graph;"
else
  docker run --rm -i postgres:16-alpine psql "$URL" -tAc "SELECT name FROM ag_catalog.ag_graph;"
fi
