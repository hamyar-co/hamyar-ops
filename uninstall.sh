#!/usr/bin/env bash
# Hamyar Ops — Uninstaller
# Usage: bash uninstall.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[hamyar-ops]${NC} $*"; }
warn()  { echo -e "${YELLOW}[hamyar-ops] WARNING:${NC} $*"; }

HAMYAR_DIR="${HAMYAR_DIR:-/opt/hamyar/ops}"
HAMYAR_LOG_DIR="${HAMYAR_LOG_DIR:-/var/log/hamyar}"
HAMYAR_BACKUP_DIR="${HAMYAR_BACKUP_DIR:-/var/backups/hamyar-ops}"
HAMYAR_TF_DIR="${HAMYAR_TF_DIR:-/opt/hamyar/tf}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash uninstall.sh"
  exit 1
fi

echo -e "${RED}${BOLD}"
echo "  This will remove Hamyar Ops from this server."
echo "  Your database data, backups, and logs will be preserved."
echo -e "${NC}"
echo -n "  Type 'yes' to continue: "
read -r CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
log "Stopping PM2 processes..."
pm2 stop hamyar-ops-api hamyar-ops-ui 2>/dev/null || true
pm2 delete hamyar-ops-api hamyar-ops-ui 2>/dev/null || true
pm2 save 2>/dev/null || true

log "Stopping Docker containers..."
cd "$HAMYAR_DIR" 2>/dev/null && docker compose stop 2>/dev/null || true

log "Removing Nginx config..."
rm -f /etc/nginx/sites-enabled/hamyar-ops
rm -f /etc/nginx/sites-available/hamyar-ops
nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || true

echo ""
echo -n "  Remove app files ($HAMYAR_DIR)? [y/N]: "
read -r DEL_APP
if [[ "$DEL_APP" =~ ^[Yy]$ ]]; then
  rm -rf "$HAMYAR_DIR/api" "$HAMYAR_DIR/web" "$HAMYAR_DIR/ecosystem.ops.config.js"
  log "App files removed"
fi

echo -n "  Remove Docker volumes (database data will be LOST)? [y/N]: "
read -r DEL_DOCKER
if [[ "$DEL_DOCKER" =~ ^[Yy]$ ]]; then
  docker compose -f "$HAMYAR_DIR/docker-compose.yml" down -v 2>/dev/null || true
  log "Docker volumes removed"
fi

echo -n "  Remove Terraform workspaces ($HAMYAR_TF_DIR)? [y/N]: "
read -r DEL_TF
if [[ "$DEL_TF" =~ ^[Yy]$ ]]; then
  rm -rf "$HAMYAR_TF_DIR"
  log "Terraform workspaces removed"
fi

echo ""
log "Hamyar Ops uninstalled."
log "Logs preserved at: $HAMYAR_LOG_DIR"
log "Backups preserved at: $HAMYAR_BACKUP_DIR"
