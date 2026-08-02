#!/usr/bin/env sh
# Railway cron job — sync the demo canvas into the AGE graph.
# Runs as the start command of the cron-import service; must exit.
# APP_URL is a service variable (default: seraph-app.up.railway.app).
set -e

APP_URL="${APP_URL:-https://seraph-app.up.railway.app}"

echo "importing demo canvas into AGE graph..."
curl -sf -X POST -H "Content-Type: application/json" \
  -d '{"canvasId":"demo"}' \
  "$APP_URL/api/graph/import"

echo
echo "done."
