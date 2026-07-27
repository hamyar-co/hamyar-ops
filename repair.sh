#!/usr/bin/env bash
# Hamyar Ops — Repair Script
# Diagnoses and fixes common installation issues
# Usage: sudo bash repair.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*"; }
error()   { echo -e "${RED}  ✗${NC} $*"; }
section() { echo -e "\n${BOLD}${BLUE}─── $* ───${NC}"; }
fix()     { echo -e "${YELLOW}  → Fixing:${NC} $*"; }

HAMYAR_DIR="${HAMYAR_DIR:-/opt/hamyar/ops}"
HAMYAR_LOG_DIR="${HAMYAR_LOG_DIR:-/var/log/hamyar}"

FIXES_APPLIED=0

apply_fix() {
  FIXES_APPLIED=$((FIXES_APPLIED + 1))
  eval "$1"
}

# ──────────────────────────────────────────────────────────────────
section "Checking root"
if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash repair.sh"
  exit 1
fi
log "Running as root"

# ──────────────────────────────────────────────────────────────────
section "Checking directories"
for dir in "$HAMYAR_DIR/api" "$HAMYAR_DIR/web" "$HAMYAR_LOG_DIR" "/var/backups/hamyar-ops"; do
  if [[ -d "$dir" ]]; then
    log "Exists: $dir"
  else
    warn "Missing: $dir"
    fix "Creating $dir"
    apply_fix "mkdir -p '$dir'"
  fi
done

# ──────────────────────────────────────────────────────────────────
section "Checking Docker"
if ! command -v docker &>/dev/null; then
  error "Docker not installed"
  fix "Install Docker"
  apply_fix "curl -fsSL https://get.docker.com | bash"
else
  log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
fi

# ──────────────────────────────────────────────────────────────────
section "Checking Docker containers"
POSTGRES_STATUS=$(docker inspect --format='{{.State.Status}}' hamyar-ops-postgres 2>/dev/null || echo "missing")
REDIS_STATUS=$(docker inspect --format='{{.State.Status}}' hamyar-ops-redis 2>/dev/null || echo "missing")

if [[ "$POSTGRES_STATUS" == "running" ]]; then
  log "PostgreSQL: running"
else
  warn "PostgreSQL: $POSTGRES_STATUS"
  if [[ -f "$HAMYAR_DIR/docker-compose.yml" ]]; then
    fix "Starting PostgreSQL"
    apply_fix "cd '$HAMYAR_DIR' && docker compose up -d postgres"
  else
    error "docker-compose.yml not found at $HAMYAR_DIR — run install.sh first"
  fi
fi

if [[ "$REDIS_STATUS" == "running" ]]; then
  log "Redis: running"
else
  warn "Redis: $REDIS_STATUS"
  if [[ -f "$HAMYAR_DIR/docker-compose.yml" ]]; then
    fix "Starting Redis"
    apply_fix "cd '$HAMYAR_DIR' && docker compose up -d redis"
  fi
fi

# ──────────────────────────────────────────────────────────────────
section "Checking PM2"
if ! command -v pm2 &>/dev/null; then
  error "PM2 not installed"
  fix "Installing PM2"
  apply_fix "npm install -g pm2@latest --quiet"
else
  log "PM2 $(pm2 -v)"
fi

API_STATUS=$(pm2 describe hamyar-ops-api 2>/dev/null | grep status | grep -o 'online\|stopped\|errored' || echo "not found")
UI_STATUS=$(pm2 describe hamyar-ops-ui 2>/dev/null | grep status | grep -o 'online\|stopped\|errored' || echo "not found")

for svc in "hamyar-ops-api:$API_STATUS" "hamyar-ops-ui:$UI_STATUS"; do
  SVC_NAME="${svc%%:*}"
  SVC_STATUS="${svc##*:}"
  if [[ "$SVC_STATUS" == "online" ]]; then
    log "PM2 $SVC_NAME: online"
  elif [[ "$SVC_STATUS" == "not found" ]]; then
    warn "PM2 $SVC_NAME: not in PM2"
    if [[ -f "$HAMYAR_DIR/ecosystem.ops.config.js" ]]; then
      fix "Starting $SVC_NAME from ecosystem"
      apply_fix "pm2 start '$HAMYAR_DIR/ecosystem.ops.config.js' --only '$SVC_NAME'"
    fi
  else
    warn "PM2 $SVC_NAME: $SVC_STATUS"
    fix "Restarting $SVC_NAME"
    apply_fix "pm2 restart '$SVC_NAME'"
  fi
done

# ──────────────────────────────────────────────────────────────────
section "Checking .env"
ENV_FILE="$HAMYAR_DIR/api/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  error ".env not found at $ENV_FILE"
  warn "Cannot auto-fix — run install.sh or create .env manually"
else
  log ".env exists"
  # Check key fields
  for KEY in DATABASE_URL REDIS_HOST JWT_ACCESS_SECRET SECRETS_ENCRYPTION_KEY; do
    if grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
      log ".env has $KEY"
    else
      warn ".env missing $KEY"
    fi
  done
  # Permissions
  PERMS=$(stat -c "%a" "$ENV_FILE" 2>/dev/null || stat -f "%p" "$ENV_FILE" | tail -c 4)
  if [[ "$PERMS" == "600" ]]; then
    log ".env permissions: 600"
  else
    warn ".env permissions: $PERMS (should be 600)"
    fix "Setting .env to 600"
    apply_fix "chmod 600 '$ENV_FILE'"
  fi
fi

# ──────────────────────────────────────────────────────────────────
section "Checking database migrations"
if [[ -f "$HAMYAR_DIR/api/.env" ]] && [[ "$POSTGRES_STATUS" == "running" ]]; then
  cd "$HAMYAR_DIR/api"
  MIGRATION_STATUS=$(node_modules/.bin/prisma migrate status 2>&1 || true)
  if echo "$MIGRATION_STATUS" | grep -q "Database schema is up to date"; then
    log "Database migrations: up to date"
  elif echo "$MIGRATION_STATUS" | grep -q "pending"; then
    warn "Pending migrations found"
    fix "Running prisma migrate deploy"
    apply_fix "cd '$HAMYAR_DIR/api' && node_modules/.bin/prisma migrate deploy"
  else
    warn "Migration status unclear — check manually: cd $HAMYAR_DIR/api && npx prisma migrate status"
  fi
fi

# ──────────────────────────────────────────────────────────────────
section "Checking Nginx"
if ! command -v nginx &>/dev/null; then
  warn "Nginx not installed"
  fix "Installing Nginx"
  apply_fix "apt-get install -y nginx"
elif ! nginx -t 2>/dev/null; then
  error "Nginx config test failed"
  warn "Check: nginx -t"
else
  log "Nginx config: valid"
fi

NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || echo "inactive")
if [[ "$NGINX_STATUS" == "active" ]]; then
  log "Nginx: active"
else
  warn "Nginx: $NGINX_STATUS"
  fix "Starting Nginx"
  apply_fix "systemctl enable nginx --now"
fi

# ──────────────────────────────────────────────────────────────────
section "Checking API health"
sleep 2
API_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3005/api/monitoring/health 2>/dev/null || echo "000")
if [[ "$API_HTTP" == "200" ]]; then
  log "API health check: HTTP 200 OK"
else
  error "API health check: HTTP $API_HTTP"
  warn "Check API logs: pm2 logs hamyar-ops-api --lines 50"

  # Common fix: rebuild native modules
  if [[ -d "$HAMYAR_DIR/api/node_modules" ]]; then
    echo ""
    echo -n "  Try to rebuild native node_modules? [y/N]: "
    read -r REBUILD
    if [[ "$REBUILD" =~ ^[Yy]$ ]]; then
      cd "$HAMYAR_DIR/api"
      find node_modules -name '*.node' -delete 2>/dev/null || true
      pnpm rebuild 2>/dev/null || npm rebuild 2>/dev/null || true
      node_modules/.bin/prisma generate
      pm2 restart hamyar-ops-api
      FIXES_APPLIED=$((FIXES_APPLIED + 1))
      sleep 3
      API_HTTP2=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3005/api/monitoring/health || echo "000")
      [[ "$API_HTTP2" == "200" ]] && log "API healthy after rebuild" || warn "Still unhealthy — check logs"
    fi
  fi
fi

# ──────────────────────────────────────────────────────────────────
section "Summary"
if [[ $FIXES_APPLIED -gt 0 ]]; then
  echo -e "\n  ${GREEN}Applied $FIXES_APPLIED fix(es).${NC}"
  pm2 save 2>/dev/null || true
else
  echo -e "\n  ${GREEN}No issues found — everything looks good!${NC}"
fi
echo ""
