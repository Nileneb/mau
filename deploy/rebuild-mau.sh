#!/usr/bin/env bash
set -euo pipefail

# Simple rebuild script for systemd to pull and rebuild the docker-compose stack
# NB: This script runs on the host and expects docker compose to be available.

WORKDIR="/home/nileneb/mau"

cd "$WORKDIR"

echo "[deploy] Pulling latest images and building local project..."
docker compose pull --quiet || true
docker compose up -d --build

echo "[deploy] Rebuild complete"
