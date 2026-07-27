#!/usr/bin/env bash
# One-time server setup for hamyar-ops
# Usage: ./deploy/setup-server.sh
# Safe to re-run (idempotent).

set -euo pipefail

SERVER="root@91.220.113.171"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Checking server state..."
ssh "$SERVER" bash << 'PROBE'
  echo "OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -a)"
  echo "Node: $(node --version 2>/dev/null || echo not installed)"
  echo "pnpm: $(pnpm --version 2>/dev/null || echo not installed)"
  echo "pm2: $(pm2 --version 2>/dev/null || echo not installed)"
  echo "nginx: $(nginx -v 2>&1 || echo not installed)"
  echo "certbot: $(certbot --version 2>/dev/null || echo not installed)"
  echo "docker: $(docker --version 2>/dev/null || echo not installed)"
PROBE

echo ""
echo "==> Creating directories..."
ssh "$SERVER" bash << 'DIRS'
  set -e
  mkdir -p /opt/hamyar/ops/{api,web}
  mkdir -p /var/log/hamyar
  echo "Directories ready."
DIRS

echo ""
echo "==> Syncing docker-compose file to server..."
rsync -az \
  "$LOCAL_ROOT/docker-compose.dev.yml" \
  "$SERVER:/opt/hamyar/ops/docker-compose.yml"

echo ""
echo "==> Starting Docker containers (postgres + redis)..."
ssh "$SERVER" bash << 'DOCKER'
  set -e
  cd /opt/hamyar/ops
  docker-compose up -d
  echo "Waiting for postgres to be healthy..."
  for i in $(seq 1 20); do
    docker exec hamyar-ops-postgres pg_isready -U opsuser -d hamyar_ops -q && break
    sleep 2
  done
  echo "Containers running:"
  docker-compose ps
DOCKER

echo ""
echo "==> Writing .env files on server (skips if already exist)..."

ssh "$SERVER" bash << 'APIENV'
  set -e
  if [ ! -f /opt/hamyar/ops/api/.env ]; then
    cat > /opt/hamyar/ops/api/.env << 'EOF'
NODE_ENV=production
PORT=3005
CORS_ORIGINS=https://ops.hamyar.app

DATABASE_URL="postgresql://opsuser:opspassword@localhost:5433/hamyar_ops"

REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=opsredispassword

JWT_ACCESS_SECRET=CHANGE_ME_ACCESS_SECRET_32CHARS_MIN
JWT_REFRESH_SECRET=CHANGE_ME_REFRESH_SECRET_32CHARS_MIN
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800

SSH_HOST=91.220.113.171
SSH_PORT=22
SSH_USERNAME=root
SSH_KEY_PATH=/root/.ssh/id_rsa

NGINX_SITES_AVAILABLE=/etc/nginx/sites-available
NGINX_SITES_ENABLED=/etc/nginx/sites-enabled

DOCKER_SOCKET=/var/run/docker.sock
DOCKER_COMPOSE_FILE=/opt/hamyar/backend/docker-compose.yml

PM2_ECOSYSTEM_FILE=/opt/hamyar/ecosystem.config.js

FILE_BROWSER_ROOTS=/etc/nginx,/opt/hamyar,/var/log,/var/www
LOG_PATH_HAMYAR=/var/log/hamyar
LOG_PATH_NGINX=/var/log/nginx
EOF
    echo "Created /opt/hamyar/ops/api/.env"
    echo "  *** EDIT JWT SECRETS BEFORE GOING LIVE ***"
  else
    echo "/opt/hamyar/ops/api/.env already exists — skipping."
  fi
APIENV

ssh "$SERVER" bash << 'WEBENV'
  set -e
  mkdir -p /opt/hamyar/ops/web/apps/web
  if [ ! -f /opt/hamyar/ops/web/apps/web/.env ]; then
    cat > /opt/hamyar/ops/web/apps/web/.env << 'EOF'
NEXT_PUBLIC_API_URL=https://ops.hamyar.app
NEXT_PUBLIC_WS_URL=https://ops.hamyar.app
EOF
    echo "Created /opt/hamyar/ops/web/apps/web/.env"
  else
    echo "/opt/hamyar/ops/web/apps/web/.env already exists — skipping."
  fi
WEBENV

echo ""
echo "==> Configuring nginx + SSL..."

# Step 1: upload HTTP-only config so nginx starts cleanly without a cert
rsync -az \
  "$LOCAL_ROOT/deploy/nginx/ops-http-only.conf" \
  "$SERVER:/etc/nginx/sites-available/ops.hamyar.app"

ssh "$SERVER" bash << 'NGINX_HTTP'
  set -e
  ln -sf /etc/nginx/sites-available/ops.hamyar.app \
         /etc/nginx/sites-enabled/ops.hamyar.app
  mkdir -p /var/www/html
  nginx -t && nginx -s reload
  echo "HTTP-only nginx config loaded."
NGINX_HTTP

# Step 2: obtain cert (nginx is now healthy, so certbot --nginx works)
ssh "$SERVER" bash << 'SSL'
  set -e
  if [ -f /etc/letsencrypt/live/ops.hamyar.app/fullchain.pem ]; then
    echo "SSL cert already exists — skipping certbot."
  else
    echo "Obtaining SSL certificate via certbot..."
    certbot certonly --nginx \
      -d ops.hamyar.app \
      --non-interactive --agree-tos \
      -m admin@hamyar.app
    echo "Certificate issued."
  fi
SSL

# Step 3: now load the full HTTPS config
rsync -az \
  "$LOCAL_ROOT/deploy/nginx/ops.conf" \
  "$SERVER:/etc/nginx/sites-available/ops.hamyar.app"

ssh "$SERVER" bash << 'NGINX_HTTPS'
  set -e
  nginx -t && nginx -s reload
  echo "Full HTTPS nginx config loaded and reloaded."
NGINX_HTTPS

echo ""
echo "==> Setup complete."
