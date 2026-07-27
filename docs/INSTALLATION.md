# Installation Guide

Complete installation guide for Hamyar Ops — from one-line quick install to fully manual production setup.

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [One-Line Install](#2-one-line-install)
3. [Manual Installation](#3-manual-installation)
4. [Development Setup](#4-development-setup)
5. [Docker Install](#5-docker-install)
6. [Post-Install Configuration](#6-post-install-configuration)
7. [Verify Installation](#7-verify-installation)
8. [Uninstall](#8-uninstall)

---

## 1. System Requirements

### Server (Production)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 20.04 LTS | Ubuntu 22.04 / 24.04 LTS |
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 1 GB | 2 GB+ |
| Disk | 20 GB | 40 GB+ SSD |
| Node.js | 20.x | 22.x LTS |
| Docker | 24+ | Latest |
| Nginx | 1.18+ | Latest |

### Developer Workstation (Local)

| Tool | Version |
|------|---------|
| Node.js | ≥ 20.0.0 |
| pnpm | ≥ 9.0.0 |
| Docker Desktop | Latest |
| Git | Any |
| rsync | Any (for deploy script) |

### Network / DNS
- A domain pointing to your server IP (e.g. `ops.example.com → 1.2.3.4`)
- Port 80 and 443 open (for SSL issuance + HTTPS traffic)
- Port 22 open for SSH

---

## 2. One-Line Install

> **Fastest path to a running Hamyar Ops instance.**

```bash
curl -fsSL https://raw.githubusercontent.com/hamyar-app/hamyar-ops/main/install.sh | bash
```

Or with explicit options:

```bash
curl -fsSL https://raw.githubusercontent.com/hamyar-app/hamyar-ops/main/install.sh | \
  DOMAIN=ops.example.com \
  EMAIL=admin@example.com \
  bash
```

### What the installer does

```
Step 1  Detect OS (Ubuntu 20.04 / 22.04 / 24.04)
Step 2  Install Node.js 22 via NodeSource
Step 3  Install pnpm, PM2, build-essential
Step 4  Install Docker Engine + Docker Compose plugin
Step 5  Install Nginx + Certbot
Step 6  Configure UFW firewall (allow 22, 80, 443)
Step 7  Create /opt/hamyar/ops/{api,web} directories
Step 8  Start PostgreSQL 15 + Redis 7 via Docker
Step 9  Clone hamyar-ops, build, and deploy
Step 10 Run database migrations and seed
Step 11 Issue Let's Encrypt SSL certificate
Step 12 Install PM2 startup script (auto-start on reboot)
Step 13 Start hamyar-ops-api (port 3005) + hamyar-ops-ui (port 3004)
```

### After install

```bash
# Check services
pm2 status

# Open dashboard
open https://ops.example.com

# Default credentials
Username: admin
Password: admin123    ← CHANGE IMMEDIATELY
```

---

## 3. Manual Installation

Step-by-step for those who want full control over each phase.

### Step 1 — Server preparation

```bash
# Update system
apt-get update && apt-get upgrade -y

# Install essentials
apt-get install -y curl git rsync build-essential nginx certbot python3-certbot-nginx ufw
```

### Step 2 — Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v   # should print v22.x.x
```

### Step 3 — Install pnpm and PM2

```bash
npm install -g pnpm@latest pm2@latest
pnpm -v && pm2 -v
```

### Step 4 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
docker -v
```

### Step 5 — Create directory structure

```bash
mkdir -p /opt/hamyar/ops/{api,web}
mkdir -p /var/log/hamyar
```

### Step 6 — Start PostgreSQL and Redis

Create `/opt/hamyar/ops/docker-compose.yml`:

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:15-alpine
    container_name: hamyar-ops-postgres
    environment:
      POSTGRES_USER: opsuser
      POSTGRES_PASSWORD: opspassword       # ← change this
      POSTGRES_DB: hamyar_ops
    ports:
      - '5433:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: hamyar-ops-redis
    command: redis-server --requirepass opsredispassword   # ← change this
    ports:
      - '6380:6379'
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

```bash
cd /opt/hamyar/ops
docker compose up -d

# Verify
docker compose ps
# Both should show "healthy"
```

### Step 7 — Clone and build

```bash
cd /opt/hamyar
git clone https://github.com/hamyar-app/hamyar-ops.git
cd hamyar-ops

pnpm install
pnpm --filter @hamyar-ops/shared build
pnpm --filter @hamyar-ops/api build
NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL="https://ops.example.com" \
  pnpm --filter @hamyar-ops/web build
```

### Step 8 — Configure API environment

```bash
cat > /opt/hamyar/ops/api/.env << 'EOF'
NODE_ENV=production
PORT=3005
CORS_ORIGINS=https://ops.example.com

DATABASE_URL="postgresql://opsuser:opspassword@localhost:5433/hamyar_ops"

REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=opsredispassword

JWT_ACCESS_SECRET=<generate: openssl rand -hex 32>
JWT_REFRESH_SECRET=<generate: openssl rand -hex 32>
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800

DEPLOY_RECORD_TOKEN=<generate: openssl rand -hex 16>
SECRETS_ENCRYPTION_KEY=<generate: openssl rand -hex 16 | head -c 32>

SSH_HOST=localhost
SSH_PORT=22
SSH_USERNAME=root
SSH_KEY_PATH=/root/.ssh/id_rsa

NGINX_SITES_AVAILABLE=/etc/nginx/sites-available
NGINX_SITES_ENABLED=/etc/nginx/sites-enabled

DOCKER_SOCKET=/var/run/docker.sock
DOCKER_COMPOSE_FILE=/opt/hamyar/ops/docker-compose.yml

PM2_ECOSYSTEM_FILE=/opt/hamyar/ecosystem.config.js

FILE_BROWSER_ROOTS=/etc/nginx,/opt/hamyar,/var/log,/var/www
LOG_PATH_HAMYAR=/var/log/hamyar
LOG_PATH_NGINX=/var/log/nginx
EOF
```

> **Security:** Generate all secrets with `openssl rand -hex 32` — never use the defaults.

### Step 9 — Run migrations and seed

```bash
cd /path/to/hamyar-ops/apps/api
DATABASE_URL="postgresql://opsuser:opspassword@localhost:5433/hamyar_ops" \
  npx prisma migrate deploy

DATABASE_URL="postgresql://opsuser:opspassword@localhost:5433/hamyar_ops" \
  node prisma/seed.js
```

### Step 10 — Configure PM2

```bash
pm2 start /opt/hamyar/ops/ecosystem.ops.config.js
pm2 save
pm2 startup   # follow the printed command to enable auto-start
```

### Step 11 — Configure Nginx

Create `/etc/nginx/sites-available/ops.example.com`:

```nginx
server {
    listen 80;
    server_name ops.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ops.example.com;

    ssl_certificate     /etc/letsencrypt/live/ops.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ops.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # WebSocket (Socket.IO)
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 86400;
    }

    # API
    location /api/ {
        proxy_pass       http://127.0.0.1:3005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    # Frontend
    location / {
        proxy_pass       http://127.0.0.1:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/ops.example.com \
        /etc/nginx/sites-enabled/ops.example.com

# Get SSL certificate first (needs HTTP-only nginx running)
certbot --nginx -d ops.example.com --non-interactive --agree-tos -m admin@example.com

nginx -t && nginx -s reload
```

### Step 12 — Configure firewall

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP → redirects to HTTPS
ufw allow 443/tcp   # HTTPS
ufw --force enable
ufw status
```

---

## 4. Development Setup

### Clone and install

```bash
git clone https://github.com/hamyar-app/hamyar-ops.git
cd hamyar-ops
pnpm install
```

### Start infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
# PostgreSQL on :5433, Redis on :6380
```

### Configure local environment

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — the defaults work for local dev
```

### Run migrations and seed

```bash
cd apps/api
npx prisma migrate dev
npx ts-node prisma/seed.ts
cd ../..
```

### Start dev servers

```bash
pnpm dev
# API:  http://localhost:3005
# UI:   http://localhost:3004
# Docs: http://localhost:3005/api/docs
```

### Useful development commands

```bash
# Run API tests
pnpm --filter @hamyar-ops/api test

# Type-check everything
pnpm --filter @hamyar-ops/api typecheck
pnpm --filter @hamyar-ops/web typecheck

# Open Prisma Studio
cd apps/api && npx prisma studio

# Regenerate Prisma client after schema change
cd apps/api && npx prisma generate

# Create a new migration
cd apps/api && npx prisma migrate dev --name describe_your_change

# Lint
pnpm lint
```

---

## 5. Docker Install

> Coming soon — a fully containerized setup with a single `docker compose up`.

For now, only PostgreSQL and Redis run in Docker. The API and UI run as PM2 processes directly on the host.

---

## 6. Post-Install Configuration

### Change default password

1. Log in at `https://ops.example.com` with `admin` / `admin123`
2. Go to **Settings → Change Password**
3. Set a strong password (12+ characters, mixed case, numbers, symbols)

### Enable 2FA (TOTP)

1. Go to **Settings → Two-Factor Authentication**
2. Scan the QR code with Google Authenticator or Authy
3. Enter the 6-digit code to confirm
4. Save your **backup codes** in a secure location

### Update JWT secrets

```bash
# On the server:
nano /opt/hamyar/ops/api/.env

# Replace these lines with strong random values:
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# Restart API to apply
pm2 restart hamyar-ops-api
```

### Connect your first managed server

1. Go to **Servers** in the sidebar
2. Click **Add Server**
3. Enter: Name, Host/IP, Port (22), Username
4. Either paste an SSH private key (SSH Keys tab first) or use password auth
5. Click **Test Connection** — should show ✅

### Configure GitHub Actions (optional)

Add to your repository secrets:
- `OPS_SSH_KEY` — your deploy server's private key
- `OPS_DEPLOY_TOKEN` — value of `DEPLOY_RECORD_TOKEN` in `.env`
- `OPS_PIPELINE_TOKEN` — webhook token from a Pipeline you create in `/pipelines`

---

## 7. Verify Installation

```bash
# API health check
curl -s https://ops.example.com/api/monitoring/health
# Expected: {"status":"ok","uptime":...}

# PM2 status
ssh root@your-server 'pm2 status'
# Both hamyar-ops-api and hamyar-ops-ui should show "online"

# Database connection
ssh root@your-server 'cd /opt/hamyar/ops/api && \
  node -e "const {PrismaClient} = require(\"@prisma/client\"); \
  const p = new PrismaClient(); \
  p.\$connect().then(() => console.log(\"DB OK\")).catch(console.error)"'

# Logs
ssh root@your-server 'pm2 logs hamyar-ops-api --lines 20 --nostream'
```

---

## 8. Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/hamyar-app/hamyar-ops/main/uninstall.sh | bash
```

Or manually:

```bash
# Stop services
pm2 delete hamyar-ops-api hamyar-ops-ui
pm2 save

# Stop Docker containers
cd /opt/hamyar/ops && docker compose down -v

# Remove files
rm -rf /opt/hamyar/ops
rm -rf /var/log/hamyar

# Remove nginx config
rm -f /etc/nginx/sites-enabled/ops.example.com
rm -f /etc/nginx/sites-available/ops.example.com
nginx -s reload

# Revoke SSL (optional)
certbot delete --cert-name ops.example.com
```
