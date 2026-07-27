#!/usr/bin/env bash
# Hamyar Ops — One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/hamyar-app/hamyar-ops/main/install.sh | bash
# Or with options:
#   DOMAIN=ops.example.com ADMIN_EMAIL=you@example.com bash <(curl -fsSL ...)

set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# Configuration (override via environment variables)
# ──────────────────────────────────────────────────────────────────
HAMYAR_DIR="${HAMYAR_DIR:-/opt/hamyar/ops}"
HAMYAR_LOG_DIR="${HAMYAR_LOG_DIR:-/var/log/hamyar}"
HAMYAR_BACKUP_DIR="${HAMYAR_BACKUP_DIR:-/var/backups/hamyar-ops}"
HAMYAR_TF_DIR="${HAMYAR_TF_DIR:-/opt/hamyar/tf}"

DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
SKIP_SSL="${SKIP_SSL:-false}"
SKIP_UFW="${SKIP_UFW:-false}"
NODE_VERSION="${NODE_VERSION:-22}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
REDIS_PASSWORD="${REDIS_PASSWORD:-$(openssl rand -hex 16)}"
REPO_URL="${REPO_URL:-https://github.com/hamyar-app/hamyar-ops.git}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ──────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────
log()     { echo -e "${GREEN}[hamyar-ops]${NC} $*"; }
warn()    { echo -e "${YELLOW}[hamyar-ops] WARNING:${NC} $*"; }
error()   { echo -e "${RED}[hamyar-ops] ERROR:${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}━━━ $* ━━━${NC}"; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    error "This installer must be run as root. Try: sudo bash install.sh"
  fi
}

check_os() {
  if [[ ! -f /etc/os-release ]]; then
    error "Cannot detect OS. This installer supports Ubuntu 20.04+ and Debian 11+."
  fi
  . /etc/os-release
  if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    error "Unsupported OS: $ID. This installer supports Ubuntu 20.04+ and Debian 11+."
  fi
  log "Detected OS: $PRETTY_NAME"
}

# ──────────────────────────────────────────────────────────────────
# Step 1 — System packages
# ──────────────────────────────────────────────────────────────────
install_system_packages() {
  section "Step 1/12 — System packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq \
    curl git rsync wget gnupg ca-certificates lsb-release \
    build-essential software-properties-common \
    nginx certbot python3-certbot-nginx \
    ufw jq ansible
  log "System packages installed"
}

# ──────────────────────────────────────────────────────────────────
# Step 2 — Node.js
# ──────────────────────────────────────────────────────────────────
install_nodejs() {
  section "Step 2/12 — Node.js $NODE_VERSION"
  if command -v node &>/dev/null && node -v | grep -q "^v${NODE_VERSION}"; then
    log "Node.js $(node -v) already installed"
    return
  fi
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
  log "Node.js $(node -v) installed"
}

# ──────────────────────────────────────────────────────────────────
# Step 3 — pnpm + PM2
# ──────────────────────────────────────────────────────────────────
install_pnpm_pm2() {
  section "Step 3/12 — pnpm + PM2"
  npm install -g pnpm@latest pm2@latest --quiet
  pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
  log "pnpm $(pnpm -v) + PM2 $(pm2 -v) installed"
}

# ──────────────────────────────────────────────────────────────────
# Step 4 — Docker
# ──────────────────────────────────────────────────────────────────
install_docker() {
  section "Step 4/12 — Docker Engine"
  if command -v docker &>/dev/null; then
    log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') already installed"
    return
  fi
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker --now
  log "Docker $(docker --version) installed"
}

# ──────────────────────────────────────────────────────────────────
# Step 5 — Directories
# ──────────────────────────────────────────────────────────────────
create_directories() {
  section "Step 5/12 — Directories"
  mkdir -p "$HAMYAR_DIR"/{api,web}
  mkdir -p "$HAMYAR_LOG_DIR"
  mkdir -p "$HAMYAR_BACKUP_DIR"
  mkdir -p "$HAMYAR_TF_DIR"
  chmod 750 "$HAMYAR_DIR"
  log "Directories created: $HAMYAR_DIR, $HAMYAR_LOG_DIR, $HAMYAR_BACKUP_DIR"
}

# ──────────────────────────────────────────────────────────────────
# Step 6 — PostgreSQL + Redis (Docker)
# ──────────────────────────────────────────────────────────────────
setup_docker_services() {
  section "Step 6/12 — PostgreSQL + Redis (Docker)"
  cat > "$HAMYAR_DIR/docker-compose.yml" <<EOF
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    container_name: hamyar-ops-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: opsuser
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: hamyar_ops
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '127.0.0.1:5433:5432'

  redis:
    image: redis:7-alpine
    container_name: hamyar-ops-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - '127.0.0.1:6380:6379'

volumes:
  postgres_data:
  redis_data:
EOF

  cd "$HAMYAR_DIR"
  docker compose up -d
  log "Waiting for PostgreSQL to be ready..."
  timeout 60 bash -c 'until docker exec hamyar-ops-postgres pg_isready -U opsuser -d hamyar_ops 2>/dev/null; do sleep 2; done'
  log "PostgreSQL + Redis started"
}

# ──────────────────────────────────────────────────────────────────
# Step 7 — Clone + Build
# ──────────────────────────────────────────────────────────────────
clone_and_build() {
  section "Step 7/12 — Clone + Build"

  REPO_DIR="/tmp/hamyar-ops-build"
  if [[ -d "$REPO_DIR" ]]; then
    rm -rf "$REPO_DIR"
  fi

  log "Cloning $REPO_URL..."
  git clone --depth=1 "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"

  log "Installing dependencies..."
  pnpm install --frozen-lockfile

  log "Building packages..."
  pnpm --filter @hamyar-ops/shared build
  pnpm --filter @hamyar-ops/api build
  NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL="https://${DOMAIN:-localhost}" \
    pnpm --filter @hamyar-ops/web build

  # Bundle API
  log "Bundling API..."
  pnpm --filter @hamyar-ops/api deploy --prod "$HAMYAR_DIR/api" --legacy

  # Copy web standalone
  log "Copying web..."
  cp -r apps/web/.next/standalone/. "$HAMYAR_DIR/web/"
  cp -r apps/web/.next/static "$HAMYAR_DIR/web/apps/web/.next/"
  cp -r apps/web/public "$HAMYAR_DIR/web/apps/web/public" 2>/dev/null || true

  # Cleanup build dir
  rm -rf "$REPO_DIR"
  log "Build complete"
}

# ──────────────────────────────────────────────────────────────────
# Step 8 — Environment
# ──────────────────────────────────────────────────────────────────
write_env() {
  section "Step 8/12 — Environment configuration"

  JWT_ACCESS_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
  SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 16 | head -c 32)
  DEPLOY_TOKEN=$(openssl rand -hex 16)

  ENV_FILE="$HAMYAR_DIR/api/.env"
  if [[ -f "$ENV_FILE" ]]; then
    warn ".env already exists, skipping (will not overwrite secrets)"
    return
  fi

  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3005

DATABASE_URL=postgresql://opsuser:${POSTGRES_PASSWORD}@127.0.0.1:5433/hamyar_ops

REDIS_HOST=127.0.0.1
REDIS_PORT=6380
REDIS_PASSWORD=${REDIS_PASSWORD}

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800

SECRETS_ENCRYPTION_KEY=${SECRETS_ENCRYPTION_KEY}
DEPLOY_RECORD_TOKEN=${DEPLOY_TOKEN}

CORS_ORIGINS=https://${DOMAIN:-localhost}

SSH_HOST=127.0.0.1
SSH_PORT=22
SSH_USERNAME=root
SSH_KEY_PATH=/root/.ssh/id_rsa

FILE_BROWSER_ROOTS=/etc/nginx,/opt/hamyar,/var/log,/var/www

LOG_PATH_HAMYAR=${HAMYAR_LOG_DIR}
LOG_PATH_NGINX=/var/log/nginx
EOF
  chmod 600 "$ENV_FILE"
  log ".env written to $ENV_FILE"

  # Save credentials for display
  cat > /tmp/hamyar-install-credentials.txt <<EOF
Hamyar Ops Installation Credentials
Generated: $(date)

Dashboard URL: https://${DOMAIN:-your-server-ip}
Default login: admin / admin123  ← CHANGE THIS IMMEDIATELY

PostgreSQL password: ${POSTGRES_PASSWORD}
Redis password: ${REDIS_PASSWORD}
Deploy record token: ${DEPLOY_TOKEN}
SECRETS_ENCRYPTION_KEY: ${SECRETS_ENCRYPTION_KEY}

JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
EOF
  chmod 600 /tmp/hamyar-install-credentials.txt
}

# ──────────────────────────────────────────────────────────────────
# Step 9 — Database migrations + seed
# ──────────────────────────────────────────────────────────────────
run_migrations() {
  section "Step 9/12 — Database migrations"
  cd "$HAMYAR_DIR/api"
  node_modules/.bin/prisma migrate deploy
  node prisma/seed.js
  log "Migrations and seed complete"
}

# ──────────────────────────────────────────────────────────────────
# Step 10 — PM2
# ──────────────────────────────────────────────────────────────────
setup_pm2() {
  section "Step 10/12 — PM2 process manager"

  cat > "$HAMYAR_DIR/ecosystem.ops.config.js" <<EOF
module.exports = {
  apps: [
    {
      name: 'hamyar-ops-api',
      cwd: '${HAMYAR_DIR}/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env_file: '.env',
      error_file: '${HAMYAR_LOG_DIR}/ops-api-error.log',
      out_file: '${HAMYAR_LOG_DIR}/ops-api-out.log',
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
    },
    {
      name: 'hamyar-ops-ui',
      cwd: '${HAMYAR_DIR}/web/apps/web',
      script: 'server.js',
      instances: 1,
      env: { PORT: '3004', HOSTNAME: '0.0.0.0' },
      max_memory_restart: '512M',
      error_file: '${HAMYAR_LOG_DIR}/ops-ui-error.log',
      out_file: '${HAMYAR_LOG_DIR}/ops-ui-out.log',
      max_restarts: 10,
    },
  ],
};
EOF

  pm2 start "$HAMYAR_DIR/ecosystem.ops.config.js"
  pm2 save
  log "PM2 processes started"
}

# ──────────────────────────────────────────────────────────────────
# Step 11 — Nginx
# ──────────────────────────────────────────────────────────────────
setup_nginx() {
  section "Step 11/12 — Nginx"

  NGINX_CONF="/etc/nginx/sites-available/hamyar-ops"
  SERVER_NAME="${DOMAIN:-_}"

  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 100M;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/hamyar-ops
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx --now
  nginx -s reload 2>/dev/null || true
  log "Nginx configured"

  # SSL
  if [[ "$SKIP_SSL" != "true" && -n "$DOMAIN" && -n "$ADMIN_EMAIL" ]]; then
    log "Obtaining SSL certificate for $DOMAIN..."
    certbot --nginx -d "$DOMAIN" -m "$ADMIN_EMAIL" --agree-tos --non-interactive --redirect || \
      warn "SSL setup failed — run: certbot --nginx -d $DOMAIN -m $ADMIN_EMAIL --agree-tos"
  elif [[ -z "$DOMAIN" ]]; then
    warn "No DOMAIN set — skipping SSL. Set DOMAIN=ops.example.com to enable SSL."
  else
    warn "SKIP_SSL=true — skipping SSL. Run certbot manually."
  fi
}

# ──────────────────────────────────────────────────────────────────
# Step 12 — UFW Firewall
# ──────────────────────────────────────────────────────────────────
setup_ufw() {
  section "Step 12/12 — Firewall (UFW)"

  if [[ "$SKIP_UFW" == "true" ]]; then
    warn "SKIP_UFW=true — skipping firewall setup"
    return
  fi

  ufw --force reset > /dev/null
  ufw default deny incoming > /dev/null
  ufw default allow outgoing > /dev/null
  ufw allow 22/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'
  ufw --force enable
  log "UFW enabled: ports 22, 80, 443 open"
}

# ──────────────────────────────────────────────────────────────────
# Verify
# ──────────────────────────────────────────────────────────────────
verify_install() {
  section "Verifying installation..."
  sleep 5

  API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3005/api/monitoring/health" 2>/dev/null || echo "000")
  if [[ "$API_STATUS" == "200" ]]; then
    log "API health check: OK"
  else
    warn "API returned HTTP $API_STATUS — check logs: pm2 logs hamyar-ops-api"
  fi

  PM2_STATUS=$(pm2 list --no-color 2>/dev/null | grep -c "online" || echo "0")
  log "PM2 processes online: $PM2_STATUS"
}

# ──────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────
print_summary() {
  DISPLAY_URL="http://$(curl -s ifconfig.me 2>/dev/null || echo 'your-server-ip')"
  if [[ -n "$DOMAIN" ]]; then
    DISPLAY_URL="https://$DOMAIN"
  fi

  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║          Hamyar Ops installed successfully!           ║${NC}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BOLD}Dashboard:${NC} $DISPLAY_URL"
  echo -e "  ${BOLD}Username:${NC}  admin"
  echo -e "  ${BOLD}Password:${NC}  admin123  ${RED}← CHANGE IMMEDIATELY${NC}"
  echo ""
  echo -e "  Credentials saved to: ${YELLOW}/tmp/hamyar-install-credentials.txt${NC}"
  echo -e "  ${RED}Move this file to a safe location and delete it from /tmp${NC}"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo -e "  1. Log in and change the admin password"
  echo -e "  2. Enable TOTP 2FA (Settings → Two-Factor Authentication)"
  echo -e "  3. Add your servers (Servers → Add Server)"
  echo ""
  echo -e "  ${BOLD}Useful commands:${NC}"
  echo -e "  pm2 status           — Check process status"
  echo -e "  pm2 logs             — View logs"
  echo -e "  pm2 restart all      — Restart everything"
  echo ""
}

# ──────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────
main() {
  echo -e "${BOLD}${BLUE}"
  echo "  __  __      _     _              ___           "
  echo " |  \/  |    (_)   | |            / _ \          "
  echo " | \  / | ___ _  __| | __ _ _ __ | | | |_ __  ___"
  echo " | |\/| |/ _ | |/ _\` |/ _\` | '_ \| | | | '_ \/ __|"
  echo " | |  | |  __/ | (_| | (_| | | | | |_| | |_) \__ \\"
  echo " |_|  |_|\___|_|\__,_|\__,_|_| |_|\___/| .__/|___/"
  echo "                                         | |       "
  echo "                                         |_|       "
  echo -e "${NC}"
  echo -e "  ${BOLD}DevOps Automation Platform — Installer${NC}"
  echo -e "  ──────────────────────────────────────"
  echo ""

  require_root
  check_os
  install_system_packages
  install_nodejs
  install_pnpm_pm2
  install_docker
  create_directories
  setup_docker_services
  clone_and_build
  write_env
  run_migrations
  setup_pm2
  setup_nginx
  setup_ufw
  verify_install
  print_summary
}

main "$@"
