# Terraform Guide

Manage infrastructure as code with Terraform workspaces — plan, apply, and track state from the dashboard.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Requirements](#2-requirements)
3. [Create a Workspace](#3-create-a-workspace)
4. [Module Library](#4-module-library)
5. [Run Terraform Commands](#5-run-terraform-commands)
6. [State Backend (S3)](#6-state-backend-s3)
7. [Live Output Streaming](#7-live-output-streaming)
8. [Variables](#8-variables)
9. [Workspace Directory Layout](#9-workspace-directory-layout)
10. [API Reference](#10-api-reference)

---

## 1. Overview

Hamyar Ops runs Terraform on the **ops server** and streams output to your browser in real-time. Terraform state is stored in an S3-compatible backend (using your configured S3 connections from the Backups module).

```
Browser: POST /api/terraform/workspaces/:id/run {command: "plan"}
  → TerraformRun created (PENDING)
  → BullMQ queue: terraform
  → [async] TerraformProcessor
  → TerraformService.executeRun()
      → Write backend.tf (S3 config)
      → Write terraform.tfvars
      → spawn: terraform -chdir=/opt/hamyar/tf/<name> plan -no-color
      → Stream lines → WS: terraform:log events
      → Parse plan summary: "Plan: 2 to add, 0 to change, 0 to destroy"
  → TerraformRun updated (SUCCESS/FAILED + planSummary)
  → WS: terraform:done event
```

---

## 2. Requirements

Terraform must be installed on the **ops server**:

```bash
# Ubuntu / Debian
wget -O - https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | tee /etc/apt/sources.list.d/hashicorp.list
apt-get update && apt-get install terraform

# Verify
terraform -version
# Terraform v1.9+
```

---

## 3. Create a Workspace

### Via dashboard

1. Go to **Infrastructure** (`/infrastructure`) → **Workspaces** tab
2. Click **New Workspace**
3. Fill in:
   - **Name** — unique identifier (used as directory name)
   - **Description** — optional notes
   - **Template** — pick from the Module Library (or start blank)
   - **Template Variables** — fill in the template's required variables
   - **State Backend** — `S3` (recommended) or `Local`
   - **S3 Config** — (if S3) select your S3 connection
4. Click **Create**

The workspace directory is created at `/opt/hamyar/tf/<name>/` on the ops server.

### Via API

```bash
curl -X POST https://ops.example.com/api/terraform/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "prod-servers",
    "description": "Production server infrastructure",
    "templateKey": "server-bootstrap",
    "templateVars": {
      "server_name": "prod-web-1",
      "server_ip": "91.220.113.171",
      "domain": "myapp.example.com"
    },
    "stateBackend": "s3",
    "s3ConfigId": "clx..."
  }'
```

---

## 4. Module Library

Four built-in templates are available. Go to **Infrastructure → Module Library**.

### `server-bootstrap` — Server topology

Documents a server's IP, name, and domain. Use after provisioning a VPS to record it in your IaC state.

```hcl
variable "server_name" { default = "prod-web-1" }
variable "server_ip"   { default = "91.220.113.171" }
variable "domain"      { default = "myapp.example.com" }

output "server_ip"   { value = var.server_ip }
output "server_name" { value = var.server_name }
```

**Template variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `server_name` | Unique server name | Yes |
| `server_ip` | Server IP address | Yes |
| `domain` | Domain pointing to this server | No |

### `web-app-stack` — Web app documentation

Documents a web app server's full stack.

```hcl
variable "app_name"  { default = "my-api" }
variable "domain"    { default = "api.example.com" }
variable "server_ip" { default = "91.220.113.171" }

output "app_url" { value = "https://${var.domain}" }
```

### `docker-stack` — Docker infrastructure

Documents a Docker + Compose deployment.

```hcl
variable "app_name"     { default = "my-app" }
variable "registry_url" { default = "ghcr.io/myorg/my-app" }
variable "server_ip"    { default = "91.220.113.171" }
```

### `monitoring-stack` — Observability

Documents Prometheus + Grafana + Loki installation.

```hcl
variable "server_ip"       { default = "91.220.113.171" }
variable "grafana_port"    { default = "3000" }
variable "prometheus_port" { default = "9090" }
variable "loki_port"       { default = "3100" }

output "grafana_url"    { value = "http://${var.server_ip}:${var.grafana_port}" }
output "prometheus_url" { value = "http://${var.server_ip}:${var.prometheus_port}" }
```

---

## 5. Run Terraform Commands

### From dashboard

1. Go to **Infrastructure → Workspaces**
2. Click **Plan** or **Apply** on any workspace:
   - **Plan** — shows what would change (safe, no changes made)
   - **Apply** — applies the plan (requires confirmation)
3. Watch live output in the **Runs** tab

> ⚠️ **Apply** requires confirmation via dialog — it cannot be undone automatically for resource-destroying changes.

### Command sequence

Always run in this order:
```
1. init   → Download providers and initialize backend
2. plan   → Preview changes (safe to run anytime)
3. apply  → Apply changes (confirm first)
```

### Destroy

Use **Destroy** (shown as a danger button) only when you want to remove all resources:

```
Workspaces → [workspace] → ... → Destroy → Confirm
```

---

## 6. State Backend (S3)

Terraform state files are stored in S3-compatible storage, enabling:
- State locking (prevents concurrent applies)
- History and versioning
- Sharing state across team members

### Configure S3 backend

1. First, add an S3 connection: **Backups → S3 Configs → Add**
2. When creating a workspace: select **State Backend: S3**, pick your S3 config
3. Set an **S3 Key** path: e.g. `terraform/prod-servers/terraform.tfstate`

### Generated backend.tf

```hcl
terraform {
  backend "s3" {
    endpoint   = "https://s3.hetzner.com"
    bucket     = "my-backups"
    key        = "terraform/prod-servers/terraform.tfstate"
    region     = "eu-central"
    access_key = "..."
    secret_key = "..."

    # For non-AWS S3 (MinIO, Backblaze, Hetzner):
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}
```

### Local state (no S3)

If you choose `stateBackend: local`, state is stored at:
```
/opt/hamyar/tf/<workspace-name>/terraform.tfstate
```

> ⚠️ This file is lost if the ops server is destroyed. Use S3 for production.

---

## 7. Live Output Streaming

All Terraform output streams to your browser in real-time.

### In the dashboard

**Infrastructure → Runs** → click any run to expand live output.

Color coding:
- 🟢 `+` lines — resources to add
- 🟡 `~` lines — resources to change
- 🔴 `-` lines — resources to destroy

**Plan summary badges:**
```
+2  ~0  -0
```
(2 to add, 0 to change, 0 to destroy)

### Via WebSocket

```js
socket.emit('subscribe', { topics: ['terraform:run-id-here'] })

socket.on('terraform:log', ({ runId, line, stream }) => {
  console.log(line)
})

socket.on('terraform:done', ({ runId, status, planSummary }) => {
  console.log(`${status}: +${planSummary.add} ~${planSummary.change} -${planSummary.destroy}`)
})
```

---

## 8. Variables

### Workspace variables

Set variables when creating a workspace or editing it:

```json
{
  "server_name": "prod-web-1",
  "server_ip": "91.220.113.171",
  "domain": "myapp.example.com"
}
```

These are written to `terraform.tfvars` in the workspace directory before each run.

### Override at runtime

Variables in `terraform.tfvars` can be overridden with `-var` flags. This is not yet exposed in the UI — edit the workspace variables to change them.

---

## 9. Workspace Directory Layout

Each workspace lives at `/opt/hamyar/tf/<workspace-name>/`:

```
/opt/hamyar/tf/prod-servers/
├── main.tf            ← generated from template (or your custom TF)
├── backend.tf         ← generated from S3Config (auto-written before each run)
├── terraform.tfvars   ← generated from workspace variables
├── .terraform/        ← provider downloads (git-ignored)
├── .terraform.lock.hcl
└── terraform.tfstate  ← only if using local backend
```

### Edit main.tf directly

SSH into the ops server and edit the file:
```bash
ssh root@your-ops-server
nano /opt/hamyar/tf/prod-servers/main.tf
```

Then run **Plan** from the dashboard to preview your changes.

---

## 10. API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/terraform/workspaces` | Any | List all workspaces |
| POST | `/api/terraform/workspaces` | ADMIN | Create workspace |
| GET | `/api/terraform/workspaces/:id` | Any | Get workspace |
| DELETE | `/api/terraform/workspaces/:id` | ADMIN | Delete workspace + directory |
| GET | `/api/terraform/workspaces/:id/runs` | Any | List runs (last 20) |
| POST | `/api/terraform/workspaces/:id/run` | ADMIN | Run command `{command}` |
| GET | `/api/terraform/templates` | Any | List module templates |
