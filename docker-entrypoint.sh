#!/bin/sh
set -e

# Ensure data directory exists and has correct permissions (needs root)
mkdir -p /app/data
chown -R node:node /app/data 2>/dev/null || true

# Run the requested command as the 'node' user for safety
exec su-exec node "$@"
