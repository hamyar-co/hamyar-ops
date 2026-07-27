# Configuration Reference

Complete reference for every environment variable and configuration option in Hamyar Ops.

---

## API Environment Variables (`apps/api/.env`)

### Application

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `development` | Yes | `development` or `production` |
| `PORT` | `3005` | No | API server port |
| `CORS_ORIGINS` | `http://localhost:3004` | Yes | Comma-separated allowed origins |

**Production example:**
```env
NODE_ENV=production
PORT=3005
CORS_ORIGINS=https://ops.example.com
```

---

### Database

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | Yes | PostgreSQL connection string |

**Format:** `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

```env
# Development (Docker)
DATABASE_URL="postgresql://opsuser:opspassword@localhost:5433/hamyar_ops"

# Production (Docker on same host)
DATABASE_URL="postgresql://opsuser:opspassword@localhost:5433/hamyar_ops"

# External managed database
DATABASE_URL="postgresql://opsuser:StrongPass@db.example.com:5432/hamyar_ops?sslmode=require"
```

---

### Redis / Queue

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `REDIS_HOST` | `localhost` | Yes | Redis host |
| `REDIS_PORT` | `6379` | Yes | Redis port |
| `REDIS_PASSWORD` | — | No | Redis password (set if auth enabled) |

```env
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=opsredispassword
```

---

### Authentication & Security

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `JWT_ACCESS_SECRET` | — | **Yes** | JWT access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | — | **Yes** | JWT refresh token signing secret (min 32 chars) |
| `JWT_ACCESS_TTL` | `3600` | No | Access token TTL in seconds (default 1 hour) |
| `JWT_REFRESH_TTL` | `604800` | No | Refresh token TTL in seconds (default 7 days) |
| `SECRETS_ENCRYPTION_KEY` | — | Yes | 32-char key for encrypting registry passwords and SSH keys |

```env
# Generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
JWT_REFRESH_SECRET=b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3

# Production: shorter TTL for access tokens
JWT_ACCESS_TTL=900       # 15 minutes
JWT_REFRESH_TTL=604800   # 7 days

# Generate with: openssl rand -hex 16 | head -c 32
SECRETS_ENCRYPTION_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

> ⚠️ **Never commit these values.** Rotate them if the `.env` file is ever exposed.

---

### Deploy Integration

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DEPLOY_RECORD_TOKEN` | — | No | Token for GitHub Actions to record deploys via `/api/applications/deploy-record/:name` |

```env
DEPLOY_RECORD_TOKEN=change-me-ops-deploy-token
```

---

### SSH (Primary Server Terminal)

These control the built-in terminal module's connection to the host server.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SSH_HOST` | — | For terminal | IP or hostname of the server to SSH into |
| `SSH_PORT` | `22` | No | SSH port |
| `SSH_USERNAME` | `root` | For terminal | SSH username |
| `SSH_KEY_PATH` | — | For terminal | Path to private key file on the API server |
| `SSH_PASSWORD` | — | No | Password auth fallback (use SSH keys instead) |

```env
SSH_HOST=91.220.113.171
SSH_PORT=22
SSH_USERNAME=root
SSH_KEY_PATH=/root/.ssh/id_rsa
```

> Multi-server SSH keys are stored in the database and managed from the **Servers → SSH Keys** page.

---

### Nginx

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NGINX_SITES_AVAILABLE` | `/etc/nginx/sites-available` | No | Path to nginx sites-available directory |
| `NGINX_SITES_ENABLED` | `/etc/nginx/sites-enabled` | No | Path to nginx sites-enabled directory |

---

### Docker

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DOCKER_SOCKET` | `/var/run/docker.sock` | No | Docker daemon socket path |
| `DOCKER_COMPOSE_FILE` | — | No | Default Docker Compose file path for the monitored app stack |

```env
DOCKER_SOCKET=/var/run/docker.sock
DOCKER_COMPOSE_FILE=/opt/hamyar/backend/docker-compose.yml
```

---

### PM2

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PM2_ECOSYSTEM_FILE` | — | No | Path to your applications' PM2 ecosystem file |

```env
PM2_ECOSYSTEM_FILE=/opt/hamyar/ecosystem.config.js
```

---

### File Browser

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `FILE_BROWSER_ROOTS` | — | No | Comma-separated list of directories the file manager is allowed to access |

```env
# Restrict to safe directories only
FILE_BROWSER_ROOTS=/etc/nginx,/opt/hamyar,/var/log,/var/www
```

> **Security:** Never add `/` or other system-critical root paths here.

---

### Logging

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `LOG_PATH_HAMYAR` | `/var/log/hamyar` | No | Directory where PM2 writes app logs |
| `LOG_PATH_NGINX` | `/var/log/nginx` | No | Nginx log directory |

---

### Observability (Optional)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `VAULT_ADDR` | — | No | HashiCorp Vault URL (e.g. `http://vault.example.com:8200`) |
| `VAULT_TOKEN` | — | No | Vault access token |
| `ANSIBLE_VAULT_PASSWORD` | — | No | Default Ansible Vault password (can also be set per-operation in the UI) |

---

## Web Environment Variables (`apps/web/.env.local`)

> These are only for **local development**. Production values are baked in at build time by `deploy.sh`.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3005` | Base URL for API calls |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3005` | WebSocket server URL for Socket.IO |

```env
# apps/web/.env.local (local dev only — do NOT commit)
NEXT_PUBLIC_API_URL=http://localhost:3005
NEXT_PUBLIC_WS_URL=http://localhost:3005
```

**Production build** overrides these automatically:
```bash
NEXT_PUBLIC_API_URL="" \           # empty = relative /api path (nginx proxies it)
NEXT_PUBLIC_WS_URL="https://ops.example.com" \
  pnpm --filter @hamyar-ops/web build
```

---

## PM2 Configuration (`deploy/ecosystem.ops.config.js`)

```js
module.exports = {
  apps: [
    {
      name: 'hamyar-ops-api',
      cwd: '/opt/hamyar/ops/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env_file: '.env',              // loads /opt/hamyar/ops/api/.env
      error_file: '/var/log/hamyar/ops-api-error.log',
      out_file: '/var/log/hamyar/ops-api-out.log',
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
    },
    {
      name: 'hamyar-ops-ui',
      cwd: '/opt/hamyar/ops/web/apps/web',
      script: 'server.js',           // Next.js standalone server
      instances: 1,
      env: { PORT: '3004', HOSTNAME: '0.0.0.0' },
      max_memory_restart: '512M',
      error_file: '/var/log/hamyar/ops-ui-error.log',
      out_file: '/var/log/hamyar/ops-ui-out.log',
      max_restarts: 10,
    },
  ],
};
```

---

## Nginx Configuration

### Port mapping

| Port | Service | Description |
|------|---------|-------------|
| `80` | Nginx | HTTP → redirects to HTTPS |
| `443` | Nginx | HTTPS entry point |
| `3004` | Next.js UI | Frontend (internal only) |
| `3005` | NestJS API | Backend (internal only) |
| `5433` | PostgreSQL | Database (internal Docker) |
| `6380` | Redis | Queue/cache (internal Docker) |

### Location routing

```
https://ops.example.com/             → :3004 (Next.js frontend)
https://ops.example.com/api/         → :3005 (NestJS API)
https://ops.example.com/socket.io/   → :3005 (WebSocket / Socket.IO)
```

---

## Docker Compose (Infrastructure)

The `docker-compose.dev.yml` / `docker-compose.yml` on the server runs **only** PostgreSQL and Redis. The app itself runs via PM2.

```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports: ['5433:5432']              # host:container
    environment:
      POSTGRES_USER: opsuser
      POSTGRES_PASSWORD: opspassword  # ← change in production
      POSTGRES_DB: hamyar_ops

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass opsredispassword  # ← change in production
    ports: ['6380:6379']
```

---

## Database Schema Overview

| Model | Purpose |
|-------|---------|
| `User` | Dashboard users with TOTP and roles |
| `Session` | JWT refresh token sessions |
| `AuditLog` | Every user action recorded |
| `AppConfig` | Registered applications (PM2, Docker) |
| `AppVersion` | Deploy history per application |
| `AppSchedule` | Cron restart schedules per app |
| `AppIncident` | Downtime / degradation incidents |
| `AppIncidentEvent` | Timeline events within an incident |
| `AlertRule` | Metric threshold alert definitions |
| `AlertEvent` | Triggered alert instances |
| `MonitoringSnapshot` | Periodic health snapshots |
| `Setting` | Key-value store for app settings |
| `S3Config` | S3-compatible storage connections |
| `BackupStrategy` | Scheduled backup definitions |
| `BackupRecord` | Individual backup file records |
| `NetworkRule` | UFW firewall rule definitions |
| `ManagedServer` | Remote servers in the fleet |
| `SshKey` | Encrypted SSH private keys |
| `ErrorLog` | Centralized error aggregator |
| `TerraformWorkspace` | Terraform workspace definitions |
| `TerraformRun` | Terraform plan/apply history |
| `AnsiblePlaybook` | Ansible playbook definitions |
| `AnsibleJob` | Ansible playbook execution history |
| `Pipeline` | Deploy pipeline definitions |
| `PipelineRun` | Pipeline execution instances |
| `PipelineStep` | Individual steps within a pipeline run |
| `ContainerRegistry` | Docker registry connections |

---

## Security Checklist

Before going live, verify:

- [ ] `JWT_ACCESS_SECRET` is at least 32 random characters
- [ ] `JWT_REFRESH_SECRET` is at least 32 random characters (different from access)
- [ ] `SECRETS_ENCRYPTION_KEY` is exactly 32 characters
- [ ] Default admin password changed
- [ ] TOTP 2FA enabled on admin account
- [ ] `FILE_BROWSER_ROOTS` does not include `/`
- [ ] Firewall allows only 22, 80, 443
- [ ] Database password is not `opspassword`
- [ ] Redis password is not `opsredispassword`
- [ ] `.env` file permissions are `600` (`chmod 600 /opt/hamyar/ops/api/.env`)
