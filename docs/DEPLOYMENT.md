# Deployment Guide

Complete guide to deploying applications using Hamyar Ops — from local scripts to automated pipelines with GitHub webhooks.

---

## Table of Contents

1. [Deploy Methods Overview](#1-deploy-methods-overview)
2. [Local Deploy Script](#2-local-deploy-script)
3. [GitHub Actions CI/CD](#3-github-actions-cicd)
4. [Deploy Pipelines (UI)](#4-deploy-pipelines-ui)
5. [Zero-Downtime Strategies](#5-zero-downtime-strategies)
6. [Rollback](#6-rollback)
7. [Deploy Pipelines from Webhook](#7-deploy-pipelines-from-webhook)
8. [Multi-Server Deploys](#8-multi-server-deploys)
9. [Environment Management](#9-environment-management)
10. [Deploy History & Audit](#10-deploy-history--audit)

---

## 1. Deploy Methods Overview

| Method | Best For | Setup |
|--------|----------|-------|
| `./deploy/deploy.sh` | Manual deploy of hamyar-ops itself | SSH access from laptop |
| GitHub Actions | Automated deploy on push to `main` | GitHub secrets configured |
| UI Pipelines (manual) | Deploy managed apps from dashboard | Pipeline created in UI |
| UI Pipelines (webhook) | Auto-deploy on GitHub push | Webhook URL added to repo |
| UI Pipelines (scheduled) | Nightly / timed deploys | Cron expression in pipeline |

---

## 2. Local Deploy Script

Deploy Hamyar Ops itself from your development machine:

```bash
# From repo root
./deploy/deploy.sh
```

### What it does (in order)

```
1. pnpm build: shared → api → web (Next.js standalone)
2. Patch Next.js client-reference manifests
3. Bundle API with pnpm deploy --prod (flattens workspace deps)
4. rsync API bundle → server:/opt/hamyar/ops/api/
   (excludes .env — your secrets are never overwritten)
5. rsync Web standalone → server:/opt/hamyar/ops/web/
6. Sync PM2 ecosystem config
7. On server:
   a. Delete macOS .node binaries (cross-platform safety)
   b. pnpm rebuild (native modules for Linux)
   c. prisma generate (Linux query engine)
   d. prisma migrate deploy (apply any new migrations)
   e. node prisma/seed.js
   f. pm2 restart hamyar-ops-api hamyar-ops-ui
   g. pm2 save
```

### Prerequisites

```bash
# Verify local toolchain
node -v      # ≥ 20
pnpm -v      # ≥ 9
rsync --version | head -1
ssh -V

# Verify SSH access
ssh root@your-server 'echo ok'
```

### Customize the target server

Edit the top of `deploy/deploy.sh`:
```bash
SERVER="root@your-server-ip"
REMOTE_API_DIR="/opt/hamyar/ops/api"
REMOTE_WEB_DIR="/opt/hamyar/ops/web"
```

---

## 3. GitHub Actions CI/CD

The `.github/workflows/deploy.yml` pipeline runs automatically on every push to `main`.

### Setup

1. Add secrets to your GitHub repository (`Settings → Secrets → Actions`):

| Secret | Value |
|--------|-------|
| `SSH_PRIVATE_KEY` | Contents of your deploy SSH private key |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan your-server-ip` |
| `OPS_DEPLOY_TOKEN` | Value of `DEPLOY_RECORD_TOKEN` in `/opt/hamyar/ops/api/.env` |
| `OPS_PIPELINE_TOKEN` | Webhook token from a pipeline created in the UI |

2. The workflow triggers on:
   - Push to `main` branch
   - Manual dispatch (`Actions → Run workflow`)

### Pipeline steps

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - Checkout
      - Setup Node 22 + pnpm
      - Install dependencies
      - Type-check API + Web
      - Build shared → api → web
      - Patch Next.js manifests
      - Bundle API with pnpm deploy --prod
      - Setup SSH agent
      - rsync API to server
      - rsync Web to server
      - Sync PM2 ecosystem
      - SSH: migrate + seed + pm2 restart
      - Health check: curl /api/monitoring/health
      - Record deployment in Ops UI
      - Trigger hamyar-ops pipeline webhook (if OPS_PIPELINE_TOKEN set)
```

### Disable CI (use local deploy instead)

```bash
gh workflow disable 'Deploy Hamyar Ops'
```

---

## 4. Deploy Pipelines (UI)

Create and manage deploy pipelines from the **Pipelines** page (`/pipelines`).

### Create a pipeline

1. Go to **Pipelines → New Pipeline**
2. Fill in:
   - **Name** — e.g. `my-app-production`
   - **App Name** — PM2 process name (e.g. `my-app`)
   - **Server** — pick from your managed servers
   - **Strategy** — Rolling, Blue/Green, or Restart
   - **Build Mode** — CI (image pre-built), Local (build on ops server), Remote (build on target server)
   - **Trigger** — Manual, Webhook, or Schedule
3. Click **Create Pipeline**

### Pipeline triggers

**Manual trigger:**
```
Pipelines page → [Trigger] button → optional commit SHA/branch
```

**Webhook trigger:**
After creating a pipeline with trigger=webhook, you'll see a webhook URL:
```
POST https://ops.example.com/api/pipelines/webhook/<your-token>
Content-Type: application/json

{
  "commitSha": "abc123",
  "branch": "main"
}
```

**Scheduled trigger:**
Set a cron expression when creating the pipeline:
```
0 2 * * *   → every day at 2:00 AM
0 */6 * * * → every 6 hours
*/30 * * * * → every 30 minutes
```

---

## 5. Zero-Downtime Strategies

### Strategy: Restart (fastest, ~1s downtime)

```
1. SSH → pm2 reload <app-name> --update-env
   (PM2's graceful reload keeps at least 1 process running during reload)
2. Verify health check passes
```

Best for: Simple Node.js apps with PM2, short reload time.

### Strategy: Rolling (recommended for Docker)

```
1. SSH → docker compose pull <service>
2. SSH → docker compose up -d --no-deps <service>
   (Compose replaces container one at a time)
3. Verify health check passes
```

Best for: Docker Compose deployments, multiple replicas.

### Strategy: Blue/Green (zero downtime, most complex)

```
1. SSH → start new container on alternate port (current + 1)
2. Wait for new container to pass health check
3. SSH → update Nginx upstream to point to new port
4. SSH → nginx -s reload
5. Wait 5 seconds for connections to drain
6. SSH → stop old container
```

Best for: Critical production apps that cannot tolerate any downtime.

### Strategy diagram

```
Rolling:
  [v1 running] → [pull v2] → [compose up v2] → [v2 running] ✓

Blue/Green:
  [v1 :3010] → [start v2 :3011] → [verify v2] → [nginx switch] → [stop v1] ✓

Restart:
  [v1 running] → [pm2 reload] → [v1→v2 in-process] ✓
```

---

## 6. Rollback

### One-click rollback from UI

1. Go to **Pipelines → Runs**
2. Find the failed run
3. Click **Rollback** → confirms last successful run's configuration is re-deployed

### Manual rollback via PM2

```bash
# List versions available in PM2
pm2 list

# If you use git-based deploy:
ssh root@your-server
cd /opt/my-app
git log --oneline -10
git checkout <previous-commit>
pm2 reload my-app
```

### Manual rollback via Docker

```bash
# Tag your images before deploying:
docker tag myapp:latest myapp:previous

# On failure, rollback:
ssh root@your-server 'docker tag myapp:previous myapp:latest && docker compose up -d --no-deps myapp'
```

### Rollback hamyar-ops itself

```bash
# On the server
cd /opt/hamyar/ops/api
git log --oneline -5   # find last good commit

# Or redeploy from a previous tag:
git checkout v1.1.0
pm2 restart hamyar-ops-api hamyar-ops-ui
```

---

## 7. Deploy Pipelines from Webhook

### GitHub repository webhook

1. In your app's GitHub repo: **Settings → Webhooks → Add webhook**
2. Set:
   - **Payload URL:** `https://ops.example.com/api/pipelines/webhook/<token>`
   - **Content type:** `application/json`
   - **Events:** `Push` (or `Releases`)
3. Copy the webhook secret from your Hamyar Ops pipeline

### Test your webhook

```bash
curl -X POST https://ops.example.com/api/pipelines/webhook/<your-token> \
  -H "Content-Type: application/json" \
  -d '{"commitSha":"abc123","branch":"main"}'

# Expected response:
# {"runId":"clx...","status":"PENDING","steps":[...]}
```

### Watch real-time in the UI

Go to **Pipelines → Runs** — the triggered run appears immediately with live step badges:

```
build  ●  →  push  ●  →  deploy  ●  →  verify  ✓
```

---

## 8. Multi-Server Deploys

Deploy the same app to multiple servers:

1. Create a pipeline per server (name them `my-app-server1`, `my-app-server2`)
2. Use the same webhook token on each
3. Or trigger them all from one webhook by chaining in your CI

### Deploy to all servers sequentially

```bash
# Example: deploy to 3 servers
for TOKEN in $TOKEN_SERVER1 $TOKEN_SERVER2 $TOKEN_SERVER3; do
  curl -sS -X POST "https://ops.example.com/api/pipelines/webhook/$TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"branch":"main"}' && sleep 30  # wait for each to complete
done
```

---

## 9. Environment Management

### Edit app environment from dashboard

1. Go to **Environment** (`/env`)
2. Select your application
3. Add/edit/delete key-value pairs
4. Click **Save** → the `.env` file on the server is updated
5. Restart the app (via PM2 page or pipeline trigger)

### Secrets manager

For sensitive values (API keys, tokens):

1. Go to **Secrets** (`/secrets`)
2. **App Env tab** — manage per-app `.env` files with masked values
3. **Ansible Vault tab** — encrypt secrets for playbooks

### Push env to new server via Ansible

Create a playbook:
```yaml
---
- name: Push environment file
  hosts: all
  tasks:
    - name: Copy .env
      copy:
        content: "{{ env_content }}"
        dest: /opt/my-app/.env
        mode: '0600'
```

Run it from **Ansible → Playbooks → Run** with the env content as a variable.

---

## 10. Deploy History & Audit

### View deploy history

- **Applications → Deploy History** — all deploys per app
- **Pipelines → History** — all pipeline runs

### Record a manual deploy

```bash
curl -X POST https://ops.example.com/api/applications/deploy-record/my-app \
  -H "Content-Type: application/json" \
  -H "x-deploy-token: your-deploy-token" \
  -d '{
    "tag": "v1.2.0",
    "commitHash": "abc123",
    "commitMsg": "feat: new feature",
    "deployedBy": "john",
    "status": "SUCCESS"
  }'
```

### Audit logs

Every deploy action is written to the Audit Log:
- **Who** triggered it (user or GitHub Actions)
- **What** was deployed (app name, version, commit)
- **When** (timestamp)
- **Result** (SUCCESS / FAILED)

View at: **Monitoring → Audit Logs** (coming in next version, currently in PostgreSQL `AuditLog` table).
