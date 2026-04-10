#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

load_env() {
    local env_file="$SCRIPT_DIR/.env"
    if [[ ! -f "$env_file" ]]; then
        echo "[ERROR] No .env file found at $env_file" >&2
        exit 1
    fi
    while IFS='=' read -r key value; do
        key=$(echo "$key" | xargs)
        [[ -z "$key" || "$key" == \#* ]] && continue
        value="${value#\"}"
        value="${value%\"}"
        value="${value#\'}"
        value="${value%\'}"
        export "$key=$value"
    done < "$env_file"
}

load_env

echo "[UPDATE] Pulling latest code..."
cd "$(dirname "$SCRIPT_DIR")"
git pull

echo "[UPDATE] Rebuilding and restarting services..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" up -d --build

echo "[UPDATE] Running database migrations..."
PG_USER="${POSTGRES_USER:-playout}"
PG_PASS="${POSTGRES_PASSWORD:-}"
PG_DB="${POSTGRES_DB:-playout}"

docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" \
    run --rm -e DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}" \
    api sh -c "cd /app/lib/db && npx drizzle-kit push --force --config ./drizzle.config.ts"

echo "[UPDATE] Restarting API to pick up schema changes..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" restart api worker

echo "[UPDATE] Done."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" ps
