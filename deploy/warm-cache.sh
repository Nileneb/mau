#!/bin/sh
set -eu

# Warm the server-side GitHub cache by requesting the configured repositories.
# This is lightweight and keeps the in-memory cache warm. Can be run from systemd or cron.

HOST="${HOST:-http://localhost:3000}"
REPOS="Nileneb/SupportedGrowControl Nileneb/growdash habibidani/axia"

for repo in $REPOS; do
  echo "[warm-cache] Requesting $repo..."
  if curl --silent --fail "$HOST/api/github?repo=$repo" >/dev/null; then
    echo "[warm-cache] OK: $repo"
  else
    echo "[warm-cache] FAILED: $repo" >&2
  fi
done
