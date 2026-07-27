#!/usr/bin/env bash
# Hamyar Ops — Update Script
# Usage: bash update.sh
# Or from repo root on your dev machine: ./update.sh

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[hamyar-ops]${NC} $*"; }
warn()  { echo -e "${YELLOW}[hamyar-ops] WARNING:${NC} $*"; }
error() { echo -e "${RED}[hamyar-ops] ERROR:${NC} $*" >&2; exit 1; }

HAMYAR_DIR="${HAMYAR_DIR:-/opt/hamyar/ops}"
REPO_URL="${REPO_URL:-https://github.com/hamyar-app/hamyar-ops.git}"
DOMAIN="${DOMAIN:-}"

# Detect if running locally (for deploy.sh) or on server
IS_SERVER=false
if [[ -f "$HAMYAR_DIR/api/.env" ]] && command -v pm2 &>/dev/null; then
  IS_SERVER=true
fi

if [[ "$IS_SERVER" == "true" ]]; then
  # ── Server-side update ──────────────────────────────────────────
  log "Server-side update starting..."

  # Backup DB first
  log "Backing up database..."
  BACKUP_FILE="/var/backups/hamyar-ops/pre-update-$(date +%Y%m%d-%H%M%S).sql.gz"
  mkdir -p "$(dirname "$BACKUP_FILE")"
  docker exec hamyar-ops-postgres pg_dump -U opsuser hamyar_ops | gzip > "$BACKUP_FILE" 2>/dev/null || \
    warn "DB backup failed (non-fatal)"
  log "Backup: $BACKUP_FILE"

  # Clone new version
  BUILD_DIR="/tmp/hamyar-ops-update-$(date +%s)"
  git clone --depth=1 "$REPO_URL" "$BUILD_DIR"
  cd "$BUILD_DIR"

  # Build
  npm install -g pnpm@latest --quiet
  pnpm install --frozen-lockfile
  pnpm --filter @hamyar-ops/shared build
  pnpm --filter @hamyar-ops/api build
  NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL="https://${DOMAIN:-localhost}" \
    pnpm --filter @hamyar-ops/web build

  # Bundle API
  pnpm --filter @hamyar-ops/api deploy --prod "$HAMYAR_DIR/api.new" --legacy

  # Sync web
  rm -rf "$HAMYAR_DIR/web.new"
  cp -r apps/web/.next/standalone/. "$HAMYAR_DIR/web.new/"
  cp -r apps/web/.next/static "$HAMYAR_DIR/web.new/apps/web/.next/"
  cp -r apps/web/public "$HAMYAR_DIR/web.new/apps/web/public" 2>/dev/null || true

  # Atomically swap (keep old .env)
  cp "$HAMYAR_DIR/api/.env" "$HAMYAR_DIR/api.new/.env"
  rm -rf "$HAMYAR_DIR/api.old" "$HAMYAR_DIR/web.old"
  mv "$HAMYAR_DIR/api" "$HAMYAR_DIR/api.old"
  mv "$HAMYAR_DIR/web" "$HAMYAR_DIR/web.old"
  mv "$HAMYAR_DIR/api.new" "$HAMYAR_DIR/api"
  mv "$HAMYAR_DIR/web.new" "$HAMYAR_DIR/web"

  # Migrate
  cd "$HAMYAR_DIR/api"
  node_modules/.bin/prisma migrate deploy
  node prisma/seed.js 2>/dev/null || true

  # Rebuild native modules
  find node_modules -name '*.node' -delete 2>/dev/null || true
  pnpm rebuild 2>/dev/null || true
  node_modules/.bin/prisma generate

  # Restart
  pm2 restart hamyar-ops-api hamyar-ops-ui
  pm2 save

  # Cleanup
  rm -rf "$BUILD_DIR" "$HAMYAR_DIR/api.old" "$HAMYAR_DIR/web.old"

  sleep 5
  API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3005/api/monitoring/health || echo "000")
  if [[ "$API_STATUS" == "200" ]]; then
    log "Update complete — API healthy"
  else
    warn "API returned HTTP $API_STATUS — check: pm2 logs hamyar-ops-api"
  fi

else
  # ── Local deploy (from dev machine) ────────────────────────────
  if [[ -f "./deploy/deploy.sh" ]]; then
    log "Running local deploy..."
    bash ./deploy/deploy.sh
  else
    error "deploy/deploy.sh not found. Run this script from the hamyar-ops repo root."
  fi
fi
