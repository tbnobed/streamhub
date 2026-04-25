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

detect_compose() {
    if docker compose version &>/dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        echo "[ERROR] Neither 'docker compose' nor 'docker-compose' found." >&2
        exit 1
    fi
}

load_env
detect_compose

echo "[UPDATE] Pulling latest code..."
cd "$(dirname "$SCRIPT_DIR")"
git pull

echo "[UPDATE] Rebuilding and restarting services..."
$COMPOSE_CMD -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" up -d --build

echo "[UPDATE] Running database migrations..."
PG_USER="${POSTGRES_USER:-playout}"
PG_PASS="${POSTGRES_PASSWORD:-}"
PG_DB="${POSTGRES_DB:-playout}"
DB_URL="postgresql://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}"

$COMPOSE_CMD -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" \
    run --rm -e DATABASE_URL="$DB_URL" \
    api sh -c "cd /app/lib/db && npx drizzle-kit push --force --config ./drizzle.config.ts"

echo "[UPDATE] Running tenant data migration..."
$COMPOSE_CMD -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" \
    exec -T postgres psql -U "$PG_USER" -d "$PG_DB" <<'SQL'
-- Create default tenant if it doesn't exist
INSERT INTO tenants (name, slug) VALUES ('Default', 'default')
ON CONFLICT DO NOTHING;

-- Get the default tenant ID
-- Ensure is_super_admin column exists on users (in case drizzle-kit push didn't run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  tid INT;
BEGIN
  SELECT id INTO tid FROM tenants WHERE slug = 'default' LIMIT 1;

  -- Backfill NULL tenant_id on all tenant-scoped tables
  EXECUTE format('UPDATE users SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE channels SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE assets SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE playlists SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE live_inputs SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE destinations SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE audit_logs SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE stream_sessions SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE notification_prefs SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXECUTE format('UPDATE invites SET tenant_id = %s WHERE tenant_id IS NULL', tid);

  -- YouTube tables may not exist yet, handle gracefully
  BEGIN
    EXECUTE format('UPDATE youtube_accounts SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE format('UPDATE youtube_broadcasts SET tenant_id = %s WHERE tenant_id IS NULL', tid);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Promote default 'admin' user to super admin if no super admin exists yet
  IF NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin = TRUE) THEN
    UPDATE users SET is_super_admin = TRUE WHERE username = 'admin';
    RAISE NOTICE 'Promoted default admin user to super admin';
  END IF;

  RAISE NOTICE 'Tenant data migration complete — default tenant ID: %', tid;
END $$;
SQL

echo "[UPDATE] Restarting API to pick up schema changes..."
$COMPOSE_CMD -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" restart api worker

echo "[UPDATE] Done."
$COMPOSE_CMD -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" ps
