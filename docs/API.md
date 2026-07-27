# API Reference

Complete REST API and WebSocket event reference for Hamyar Ops v1.2.0.

**Base URL:** `https://ops.example.com/api`
**Auth:** Bearer token (JWT) in `Authorization` header  
**Interactive Docs:** `https://ops.example.com/api/docs` (Swagger UI)

---

## Authentication

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

**Response (no 2FA):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "username": "admin", "role": "ADMIN" }
}
```

**Response (2FA required):**
```json
{
  "requiresTOTP": true,
  "tempToken": "eyJ..."
}
```

### TOTP Verify

```http
POST /auth/totp/verify
Authorization: Bearer <tempToken>

{ "code": "123456" }
```

### Refresh Token

```http
POST /auth/refresh
Authorization: Bearer <refreshToken>
```

### Logout

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

---

## Users

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/users` | ADMIN | List all users |
| POST | `/users` | ADMIN | Create user |
| GET | `/users/me` | Any | Get current user |
| PATCH | `/users/me/password` | Any | Change own password |
| PATCH | `/users/:id` | ADMIN | Update user |
| DELETE | `/users/:id` | ADMIN | Delete user |

### Create user

```http
POST /users
Authorization: Bearer <adminToken>

{
  "username": "alice",
  "email": "alice@example.com",
  "password": "SecurePass123!",
  "role": "VIEWER"
}
```

---

## Server Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/server/metrics` | Current server metrics (CPU, RAM, disk, network) |
| GET | `/server/processes` | Running process list |
| GET | `/monitoring/health` | Health check (no auth required) |
| GET | `/monitoring/snapshots` | Historical monitoring snapshots |
| GET | `/monitoring/alert-rules` | List alert rules |
| POST | `/monitoring/alert-rules` | Create alert rule |
| PUT | `/monitoring/alert-rules/:id` | Update alert rule |
| DELETE | `/monitoring/alert-rules/:id` | Delete alert rule |
| GET | `/monitoring/alert-events` | Recent alert events |

### Health check (public)

```http
GET /monitoring/health
```

```json
{
  "status": "ok",
  "uptime": 86400,
  "version": "1.2.0",
  "timestamp": "2026-07-11T10:00:00.000Z"
}
```

---

## Applications

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/applications` | Any | List all apps |
| POST | `/applications` | ADMIN | Register app |
| GET | `/applications/:name` | Any | Get app |
| PUT | `/applications/:name` | ADMIN | Update app |
| DELETE | `/applications/:name` | ADMIN | Delete app |
| GET | `/applications/:name/versions` | Any | Deploy history |
| POST | `/applications/deploy-record/:name` | Token | Record a deploy |

### Record deploy (from CI)

```http
POST /applications/deploy-record/my-app
x-deploy-token: your-deploy-token

{
  "tag": "v1.2.0",
  "commitHash": "abc123",
  "commitMsg": "feat: new feature",
  "deployedBy": "github-actions",
  "status": "SUCCESS"
}
```

---

## PM2

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/pm2/processes` | Any | List PM2 processes |
| POST | `/pm2/:name/start` | ADMIN | Start process |
| POST | `/pm2/:name/stop` | ADMIN | Stop process |
| POST | `/pm2/:name/restart` | ADMIN | Restart process |
| POST | `/pm2/:name/reload` | ADMIN | Graceful reload |
| DELETE | `/pm2/:name` | ADMIN | Delete process |
| GET | `/pm2/:name/logs` | Any | Recent logs |

---

## Docker

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/docker/containers` | Any | List containers |
| POST | `/docker/containers/:id/start` | ADMIN | Start container |
| POST | `/docker/containers/:id/stop` | ADMIN | Stop container |
| POST | `/docker/containers/:id/restart` | ADMIN | Restart container |
| DELETE | `/docker/containers/:id` | ADMIN | Remove container |
| GET | `/docker/containers/:id/logs` | Any | Container logs |
| GET | `/docker/images` | Any | List images |
| DELETE | `/docker/images/:id` | ADMIN | Remove image |
| GET | `/docker/volumes` | Any | List volumes |
| GET | `/docker/networks` | Any | List networks |
| GET | `/docker/compose` | Any | List Compose projects |
| POST | `/docker/compose/:name/up` | ADMIN | docker compose up -d |
| POST | `/docker/compose/:name/down` | ADMIN | docker compose down |
| POST | `/docker/compose/:name/pull` | ADMIN | docker compose pull |

---

## Multi-Server Fleet

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/servers` | Any | List managed servers |
| POST | `/servers` | ADMIN | Add server |
| PUT | `/servers/:id` | ADMIN | Update server |
| DELETE | `/servers/:id` | ADMIN | Delete server |
| POST | `/servers/:id/ping` | Any | Test connectivity |
| GET | `/servers/:id/metrics` | Any | Remote metrics |
| POST | `/servers/:id/execute` | ADMIN | Run remote command |
| POST | `/servers/:id/reboot` | ADMIN | Reboot server |
| POST | `/servers/:id/shutdown` | ADMIN | Shutdown server |
| GET | `/servers/ssh-keys` | Any | List SSH keys |
| POST | `/servers/ssh-keys` | ADMIN | Add SSH key |
| DELETE | `/servers/ssh-keys/:id` | ADMIN | Delete SSH key |

---

## Pipelines

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/pipelines` | Any | List pipelines |
| POST | `/pipelines` | ADMIN | Create pipeline |
| PUT | `/pipelines/:id` | ADMIN | Update pipeline |
| DELETE | `/pipelines/:id` | ADMIN | Delete pipeline |
| PATCH | `/pipelines/:id/toggle` | ADMIN | Enable/disable |
| POST | `/pipelines/:id/trigger` | ADMIN | Manual trigger |
| GET | `/pipelines/:id/runs` | Any | List runs |
| GET | `/pipelines/runs/:runId` | Any | Get run with steps |
| POST | `/pipelines/runs/:runId/rollback` | ADMIN | Rollback run |
| POST | `/pipelines/webhook/:token` | **None** | GitHub webhook |

### Trigger a pipeline

```http
POST /pipelines/:id/trigger
Authorization: Bearer <token>

{
  "commitSha": "abc123",
  "branch": "main"
}
```

### GitHub webhook

```http
POST /pipelines/webhook/<your-token>
Content-Type: application/json

{
  "commitSha": "abc123",
  "branch": "main"
}
```

No authentication required — the token in the URL serves as authentication.

---

## Ansible

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/ansible/playbooks` | Any | List playbooks |
| POST | `/ansible/playbooks` | ADMIN | Create playbook |
| PUT | `/ansible/playbooks/:id` | ADMIN | Update playbook |
| DELETE | `/ansible/playbooks/:id` | ADMIN | Delete (non-builtin) |
| POST | `/ansible/playbooks/:id/run` | ADMIN | Run playbook |
| GET | `/ansible/jobs` | Any | List jobs |
| GET | `/ansible/jobs/:id` | Any | Get job with output |
| GET | `/ansible/drift/:serverId` | Any | Run drift check |

---

## Terraform

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/terraform/workspaces` | Any | List workspaces |
| POST | `/terraform/workspaces` | ADMIN | Create workspace |
| GET | `/terraform/workspaces/:id` | Any | Get workspace |
| DELETE | `/terraform/workspaces/:id` | ADMIN | Delete workspace |
| GET | `/terraform/workspaces/:id/runs` | Any | List runs |
| POST | `/terraform/workspaces/:id/run` | ADMIN | Run command |
| GET | `/terraform/templates` | Any | List module templates |

---

## Backups

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/backups/s3` | Any | List S3 configs |
| POST | `/backups/s3` | ADMIN | Create S3 config |
| DELETE | `/backups/s3/:id` | ADMIN | Delete S3 config |
| GET | `/backups/strategies` | Any | List strategies |
| POST | `/backups/strategies` | ADMIN | Create strategy |
| POST | `/backups/strategies/:id/run` | ADMIN | Run now |
| GET | `/backups/records` | Any | List records |
| POST | `/backups/records/:id/restore` | ADMIN | Restore |
| GET | `/backups/records/:id/download` | Any | Download file |

---

## Container Registry

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/registry` | Any | List registries |
| POST | `/registry` | ADMIN | Add registry |
| PUT | `/registry/:id` | ADMIN | Update registry |
| DELETE | `/registry/:id` | ADMIN | Delete registry |
| POST | `/registry/:id/test` | Any | Test connection |
| GET | `/registry/:id/images` | Any | List images |
| POST | `/registry/build` | ADMIN | Trigger image build |
| POST | `/registry/pull` | ADMIN | Pull image on server |

---

## Secrets

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/secrets/vault-status` | Any | Vault status |
| POST | `/secrets/vault-password` | ADMIN | Set vault password |
| POST | `/secrets/ansible/encrypt` | ADMIN | Encrypt variable |
| POST | `/secrets/ansible/decrypt` | ADMIN | Decrypt variable |

---

## Observability

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/observability/status` | **None** | Public status data |
| GET | `/observability/grafana/:serverId` | Any | Grafana embed URL |
| GET | `/observability/prometheus-targets` | Any | Prometheus scrape targets |
| GET | `/observability/install-status/:serverId` | Any | Stack install status |
| POST | `/observability/install/:serverId` | ADMIN | Install monitoring stack |

---

## Network / Firewall

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/network/rules` | Any | List UFW rules |
| POST | `/network/rules` | ADMIN | Add rule |
| DELETE | `/network/rules/:id` | ADMIN | Remove rule |
| POST | `/network/enable` | ADMIN | Enable UFW |
| POST | `/network/disable` | ADMIN | Disable UFW |
| POST | `/network/disable-external` | ADMIN | Block all external |
| POST | `/network/restrict-localhost` | ADMIN | Restrict to localhost |

---

## Error Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/error-logs` | List errors (query: source, sourceName, limit) |
| DELETE | `/error-logs/:id` | Delete error record |
| DELETE | `/error-logs/clear` | Clear all errors |

---

## WebSocket Events

Connect to the WebSocket server at `wss://ops.example.com` with Socket.IO.

### Connection

```javascript
import { io } from 'socket.io-client'

const socket = io('https://ops.example.com', {
  auth: { token: accessToken },
  transports: ['websocket', 'polling'],
})

socket.on('connect', () => console.log('Connected'))
socket.on('connect_error', (err) => console.error('Auth failed:', err.message))
```

### Subscribe to topics

```javascript
socket.emit('subscribe', {
  topics: ['pm2', 'docker', 'server', 'pipeline:run-id-123']
})
```

### Event reference

| Event | Emitted When |
|-------|-------------|
| `pm2:status` | PM2 process list updated |
| `pm2:log` | PM2 app log line |
| `docker:stats` | Container CPU/RAM stats |
| `docker:event` | Container started/stopped |
| `docker:log` | Container log line |
| `server:metrics` | Server CPU/RAM/disk/network |
| `logs:line` | nginx/system log line |
| `alert:triggered` | Alert rule fired |
| `notification:push` | System notification |
| `deploy:start` | App deploy started |
| `deploy:log` | Deploy log line |
| `deploy:done` | Deploy finished |
| `backup:start` | Backup started |
| `backup:log` | Backup progress line |
| `backup:done` | Backup finished |
| `terraform:log` | Terraform output line |
| `terraform:done` | Terraform run finished |
| `ansible:log` | Ansible output line |
| `ansible:done` | Ansible job finished |
| `pipeline:log` | Pipeline log line |
| `pipeline:step` | Pipeline step status change |
| `pipeline:done` | Pipeline run finished |
| `registry:build:log` | Build log line |
| `registry:build:done` | Build finished |
| `terminal:output` | PTY output |
| `terminal:closed` | Terminal session ended |

---

## Error Responses

All API errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Validation failed: name must not be empty",
  "error": "Bad Request",
  "timestamp": "2026-07-11T10:00:00.000Z",
  "path": "/api/servers"
}
```

### Common status codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request / validation error |
| `401` | Not authenticated |
| `403` | Forbidden (wrong role) |
| `404` | Resource not found |
| `409` | Conflict (duplicate name) |
| `429` | Rate limited |
| `500` | Internal server error |

### Rate limits

| Endpoint pattern | Limit |
|----------------|-------|
| `/auth/login` | 10 req/min |
| Everything else | 100 req/min |
