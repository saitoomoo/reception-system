#!/bin/sh
set -e

echo "Running database migrations..."
/app/migrate -path /migrations -database "${DATABASE_URL}" up

echo "Starting server..."
exec /app/server
