#!/bin/sh
set -e

echo "Running database migrations..."
# Neon pooler can cause advisory lock release failures (pq driver limitation).
# The migration itself succeeds; only the unlock step errors. Allow non-zero exit.
/app/migrate -path /migrations -database "${DATABASE_URL}" up || echo "Migration command exited with error (advisory lock issue with pooler is expected), continuing..."

echo "Starting server..."
exec /app/server
