# Container Registry Guide

Build Docker images, manage registry connections, and pull images to managed servers.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Add a Registry](#2-add-a-registry)
3. [List Images](#3-list-images)
4. [Build an Image](#4-build-an-image)
5. [Pull Image to a Server](#5-pull-image-to-a-server)
6. [Supported Registries](#6-supported-registries)
7. [API Reference](#7-api-reference)

---

## 1. Overview

The Registry module connects Hamyar Ops to any Docker registry (Docker Hub, GitHub Container Registry, or self-hosted). It can build images in three modes and list available tags.

```
Registry page
├── Registries tab  — manage registry connections
├── Images tab      — list tags per registry
└── Builds tab      — build history + live logs
```

---

## 2. Add a Registry

1. Go to **Registry → Registries**
2. Click **Add Registry**
3. Fill in:

| Field | Description |
|-------|-------------|
| Name | Display name (e.g. `ghcr-prod`) |
| Type | `dockerhub`, `ghcr`, or `self-hosted` |
| URL | Required for self-hosted (e.g. `https://registry.example.com`) |
| Username | Registry username |
| Password/Token | Registry password or access token |

4. Click **Test Connection** to verify credentials
5. Click **Save**

Passwords are encrypted with AES-256-GCM before storage.

### Docker Hub example

```
Type:     dockerhub
Username: myusername
Password: dckr_pat_xxx  ← use a Personal Access Token, not your account password
```

### GHCR example

```
Type:     ghcr
Username: your-github-username
Password: ghp_xxx  ← GitHub Personal Access Token with read:packages + write:packages
```

### Self-hosted (Harbor, Nexus, Gitea) example

```
Type:     self-hosted
URL:      https://registry.example.com
Username: admin
Password: your-password
```

---

## 3. List Images

1. Go to **Registry → Images**
2. Select a registry from the dropdown
3. Images and tags are listed with size and last push time

For **Docker Hub** and **GHCR**, the registry API is queried directly.
For **self-hosted** registries, the Docker Registry HTTP API v2 is used.

---

## 4. Build an Image

### Build modes

| Mode | Build Location | Use When |
|------|---------------|----------|
| `ci` | CI system (pre-built) | GitHub Actions built the image — just record the tag |
| `local` | Ops server | Ops server can reach the codebase |
| `remote` | Target managed server | Code is on the target server |

### Trigger a build from UI

1. Go to **Registry → Builds**
2. Click **New Build**
3. Fill in:
   - **App Name** — PM2 process or app identifier
   - **Build Mode** — `local`, `remote`, or `ci`
   - **Registry** — select from your configured registries
   - **Image Tag** — e.g. `v1.2.0` or `latest`
   - **Build Context** — directory on the build server (default: app deploy path)
   - **Target Server** — (required for `remote` mode)
4. Click **Build**

### Watch live logs

The build log streams in real-time while the image is building:

```
Step 1/8 : FROM node:22-alpine
 ---> abc123
Step 2/8 : WORKDIR /app
 ---> def456
...
Successfully built ghijkl
Successfully tagged ghcr.io/myorg/my-app:v1.2.0
```

### Example: Build on ops server

```bash
# Equivalent to what Hamyar Ops does internally:
docker build -t ghcr.io/myorg/my-app:v1.2.0 /opt/my-app
docker push ghcr.io/myorg/my-app:v1.2.0
```

---

## 5. Pull Image to a Server

After building or when you want to pre-pull an image on a managed server:

1. **Registry → Images** → find the image tag
2. Click **Pull to Server** → select a managed server
3. The image is pulled via SSH: `docker pull <image>`

### Via API

```bash
curl -X POST https://ops.example.com/api/registry/pull \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serverId": "clx...",
    "image": "ghcr.io/myorg/my-app:v1.2.0"
  }'
```

---

## 6. Supported Registries

| Registry | Type | Image listing | Build push |
|----------|------|--------------|------------|
| Docker Hub | `dockerhub` | ✅ via Hub API | ✅ |
| GitHub Container Registry | `ghcr` | ✅ via GHCR API | ✅ |
| Harbor | `self-hosted` | ✅ via Registry v2 API | ✅ |
| Nexus | `self-hosted` | ✅ via Registry v2 API | ✅ |
| Gitea | `self-hosted` | ✅ via Registry v2 API | ✅ |
| AWS ECR | `self-hosted` | ✅ (set URL to ECR endpoint) | ✅ |
| Google Artifact Registry | `self-hosted` | ✅ | ✅ |

---

## 7. API Reference

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/registry` | Any | List registries |
| POST | `/api/registry` | ADMIN | Add registry |
| PUT | `/api/registry/:id` | ADMIN | Update registry |
| DELETE | `/api/registry/:id` | ADMIN | Delete registry |
| POST | `/api/registry/:id/test` | Any | Test connection |
| GET | `/api/registry/:id/images` | Any | List images/tags |
| POST | `/api/registry/build` | ADMIN | Start image build |
| POST | `/api/registry/pull` | ADMIN | Pull image on server |
