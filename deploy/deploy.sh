#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

load_env() {
    local env_file="$SCRIPT_DIR/.env"
    if [[ ! -f "$env_file" ]]; then
        return
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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        err "This script must be run as root (or with sudo)."
        exit 1
    fi
}

install_prereqs() {
    log "Installing prerequisites..."
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release openssl git
    log "Prerequisites installed."
}

install_docker() {
    if command -v docker &>/dev/null; then
        log "Docker already installed: $(docker --version)"
        return
    fi

    log "Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker

    log "Docker installed: $(docker --version)"
}

setup_env() {
    local env_file="$SCRIPT_DIR/.env"

    if [[ -f "$env_file" ]]; then
        log ".env file already exists at $env_file"
        return
    fi

    log "Creating .env file from template..."
    cp "$SCRIPT_DIR/.env.example" "$env_file"
    chmod 600 "$env_file"

    local pg_pass
    pg_pass=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
    local session_secret
    session_secret=$(openssl rand -hex 32)

    sed -i "s|POSTGRES_PASSWORD=CHANGE_ME_strong_password_here|POSTGRES_PASSWORD=${pg_pass}|" "$env_file"
    sed -i "s|SESSION_SECRET=CHANGE_ME_random_64_char_string|SESSION_SECRET=${session_secret}|" "$env_file"

    log "Generated secure passwords in .env"
    warn "Review and update $env_file before proceeding (especially INGEST_HOST and SRS_API_URL)."
}

run_db_migrate() {
    load_env

    log "Waiting for PostgreSQL to be healthy..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" up -d postgres

    local retries=30
    local pg_user="${POSTGRES_USER:-playout}"
    while [[ $retries -gt 0 ]]; do
        if docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" \
            exec -T postgres pg_isready -U "$pg_user" &>/dev/null; then
            break
        fi
        retries=$((retries - 1))
        sleep 1
    done

    if [[ $retries -eq 0 ]]; then
        err "PostgreSQL did not become healthy in time."
        exit 1
    fi

    log "Pushing database schema with drizzle-kit..."

    local pg_password="${POSTGRES_PASSWORD:-}"
    local pg_db="${POSTGRES_DB:-playout}"
    local db_url="postgresql://${pg_user}:${pg_password}@postgres:5432/${pg_db}"

    docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" \
        run --rm -e DATABASE_URL="$db_url" \
        api sh -c "cd /app/lib/db && npx drizzle-kit push --force --config ./drizzle.config.ts"

    log "Database schema pushed successfully."
}

build_images() {
    log "Building Docker images (this may take several minutes on first run)..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" build
    log "Docker images built successfully."
}

start_services() {
    log "Starting all services..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" up -d
    log "All services started."
}

show_status() {
    echo ""
    log "============================================"
    log "  Social Playout Manager - Deployment Status"
    log "============================================"
    echo ""
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" ps
    echo ""

    load_env
    local port="${PUBLIC_PORT:-80}"
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_SERVER_IP")

    log "Application URL:  http://${ip}:${port}"
    log "Default login:    admin / admin123"
    echo ""
    log "Useful commands:"
    echo "  View logs:       docker compose -f $SCRIPT_DIR/docker-compose.yml --env-file $SCRIPT_DIR/.env logs -f"
    echo "  Stop:            docker compose -f $SCRIPT_DIR/docker-compose.yml --env-file $SCRIPT_DIR/.env down"
    echo "  Restart:         docker compose -f $SCRIPT_DIR/docker-compose.yml --env-file $SCRIPT_DIR/.env restart"
    echo "  Rebuild & start: docker compose -f $SCRIPT_DIR/docker-compose.yml --env-file $SCRIPT_DIR/.env up -d --build"
    echo ""
}

main() {
    log "Starting Social Playout Manager deployment..."
    echo ""

    check_root
    install_prereqs
    install_docker

    setup_env

    if [[ "${1:-}" == "--env-only" ]]; then
        log "Environment setup complete. Edit $SCRIPT_DIR/.env then re-run without --env-only."
        exit 0
    fi

    build_images
    run_db_migrate
    start_services
    show_status
}

main "$@"
