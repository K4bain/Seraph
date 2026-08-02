#!/usr/bin/env sh
# Railway cron job — trigger connector polling on the main app.
# Runs as the start command of the cron-poll service; must exit.
# APP_URL is a service variable (default: seraph-app.up.railway.app).
set -e

APP_URL="${APP_URL:-https://seraph-app.up.railway.app}"

for connector in gdelt opensanctions edgar; do
  echo "polling $connector..."
  if ! curl -sf -X POST -H "Content-Type: application/json" \
    -d "{\"connectorId\":\"$connector\",\"canvasId\":\"demo\"}" \
    "$APP_URL/api/connectors" >/dev/null; then
    echo "  failed: $connector"
  fi
done

echo "done."
