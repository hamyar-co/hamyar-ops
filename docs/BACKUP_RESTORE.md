# Backup & Restore Guide

Automated and ad-hoc backups for applications, databases, containers, and full servers — with local and S3 storage.

---

## Table of Contents

1. [Backup Types](#1-backup-types)
2. [Configure S3 Storage](#2-configure-s3-storage)
3. [Create a Backup Strategy](#3-create-a-backup-strategy)
4. [Run an Ad-hoc Backup](#4-run-an-ad-hoc-backup)
5. [Restore from Backup](#5-restore-from-backup)
6. [Backup Retention](#6-backup-retention)
7. [Full Server Backup](#7-full-server-backup)
8. [Database Backup](#8-database-backup)
9. [API Reference](#9-api-reference)

---

## 1. Backup Types

| Type | What's backed up | Format |
|------|-----------------|--------|
| `app` | Application directory (excludes node_modules, .next, dist, .git) | `.tar.gz` |
| `database` | PostgreSQL or MySQL dump | `.sql.gz` |
| `container` | Docker named volumes + docker-compose.yml | `.tar.gz` |
| `compose` | Docker Compose file only | `.tar.gz` |
| `full` | All apps + databases + containers + configs | `.tar.gz` |

---

## 2. Configure S3 Storage

Before creating strategies, add an S3-compatible storage connection:

1. Go to **Backups → S3 Configs** tab
2. Click **Add S3 Config**
3. Fill in:

| Field | Example | Notes |
|-------|---------|-------|
| Name | `hetzner-storage` | Display name |
| Endpoint | `https://s3.hetzner.com` | S3 API endpoint |
| Region | `eu-central` | Usually `default` for non-AWS |
| Bucket | `my-backups` | Bucket must exist already |
| Access Key ID | `...` | S3 access key |
| Secret Access Key | `...` | S3 secret key |
| Use Path Style | ✅ | Required for MinIO, Hetzner, Backblaze |

4. Click **Test Connection** to verify
5. Click **Save**

### Supported S3-compatible providers

| Provider | Endpoint format |
|----------|----------------|
| AWS S3 | `https://s3.amazonaws.com` |
| Hetzner Object Storage | `https://s3.hetzner.com` |
| MinIO (self-hosted) | `http://your-minio:9000` |
| Backblaze B2 | `https://s3.us-west-004.backblazeb2.com` |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` |
| DigitalOcean Spaces | `https://<region>.digitaloceanspaces.com` |

---

## 3. Create a Backup Strategy

A strategy defines **what** to back up, **how often**, and **where** to store it.

1. Go to **Backups → Strategies** tab
2. Click **New Strategy**
3. Configure:

| Field | Example | Description |
|-------|---------|-------------|
| Name | `daily-my-app` | Unique strategy name |
| Target Type | `app` | What to back up |
| Targets | `my-app` | App name, DB target, or container name |
| Storage | `s3` | `local` or `s3` |
| S3 Config | (select) | Required if storage=s3 |
| Schedule (Cron) | `0 2 * * *` | When to run automatically |
| Retention Max | `24` | Keep last N backups |
| Exclude node_modules | ✅ | Skip dependencies |
| Enabled | ✅ | Active/inactive |

### Cron expression examples

| Expression | Schedule |
|-----------|----------|
| `0 2 * * *` | Every day at 2:00 AM |
| `0 */6 * * *` | Every 6 hours |
| `0 2 * * 0` | Every Sunday at 2:00 AM |
| `0 2 1 * *` | 1st of every month at 2:00 AM |
| `*/30 * * * *` | Every 30 minutes |

---

## 4. Run an Ad-hoc Backup

Run a backup immediately without waiting for the scheduled time:

1. Go to **Backups → Strategies**
2. Click **Run Now** on any strategy

Or from **Backups → Records** → **New Backup** (ad-hoc without a strategy).

### Via API

```bash
# Run a strategy now
curl -X POST https://ops.example.com/api/backups/strategies/:id/run \
  -H "Authorization: Bearer $TOKEN"

# Create ad-hoc backup
curl -X POST https://ops.example.com/api/backups/adhoc \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetType": "app",
    "targetName": "my-app",
    "storage": "s3",
    "s3ConfigId": "clx..."
  }'
```

### Watch backup progress

Backup progress streams via WebSocket:

```js
// After triggering backup, you get a recordId
socket.emit('subscribe', { topics: ['backup:logs:record-id'] })

socket.on('backup:log', ({ recordId, line, stream }) => {
  console.log(line)
})

socket.on('backup:done', ({ recordId, status, sizeBytes }) => {
  console.log(`Backup ${status}: ${sizeBytes} bytes`)
})
```

---

## 5. Restore from Backup

### Via dashboard

1. Go to **Backups → Records**
2. Find the backup record you want to restore
3. Click **Restore**
4. Confirm — the restore runs asynchronously

### What happens during restore

**App restore:**
- Downloads backup from S3 (or reads local file)
- Extracts to `<deployPath>/.restore-<timestamp>/`
- You then manually swap directories or re-deploy

**Database restore:**
- Downloads SQL dump
- Pipes through `psql` or `mysql` to `docker exec` in the DB container

**Full restore:**
- Restores apps, databases, and configs in sequence
- Returns a `RestoreResultDto` with per-component results

### Via API

```bash
curl -X POST https://ops.example.com/api/backups/records/:id/restore \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. Backup Retention

When a strategy's backup limit is reached, the oldest backups are automatically deleted.

### Example

Strategy: `retentionMax: 7`

```
Run 1:  backup-20260701.tar.gz  ← oldest
Run 2:  backup-20260702.tar.gz
Run 3:  backup-20260703.tar.gz
...
Run 7:  backup-20260707.tar.gz  ← newest
Run 8:  backup-20260708.tar.gz  ← triggers: backup-20260701 deleted
```

### Local cleanup

Local backups (stored on the ops server at `/var/backups/hamyar-ops/`) expire after 24 hours by default. A BullMQ cleanup job runs periodically to remove expired files.

### Manual cleanup

```bash
# See what's taking space
ls -lh /var/backups/hamyar-ops/

# Delete old backups manually
find /var/backups/hamyar-ops/ -name "*.tar.gz" -mtime +7 -delete
```

---

## 7. Full Server Backup

A full backup includes everything:

- All registered applications (their deploy paths)
- All databases (PostgreSQL + MySQL auto-discovered)
- All Docker named volumes
- All Docker Compose files
- SSH keys and nginx configs

### Run a full backup

1. Go to **Backups → Strategies → New Strategy**
2. Set Target Type: `full`
3. Leave Targets empty (auto-discovers everything)
4. Choose storage and schedule
5. Click **Save** and **Run Now**

### Full backup structure

```
full-backup-20260711-100000.tar.gz
├── manifest.json           ← metadata: apps, DBs, versions
├── apps/
│   ├── my-app/             ← app files (excludes node_modules)
│   └── my-api/
├── databases/
│   ├── mydb.sql.gz         ← PostgreSQL dump
│   └── wordpress.sql.gz    ← MySQL dump
├── docker-volumes/
│   └── my-data-volume.tar.gz
└── configs/
    ├── nginx-sites.tar.gz
    └── env-files.tar.gz
```

---

## 8. Database Backup

### PostgreSQL backup

Target format: `container::postgres::dbname`

Example targets:
```
hamyar-ops-postgres::postgres::hamyar_ops
my-app-postgres::postgres::myapp_production
```

The backup runs `pg_dump` inside the Docker container:
```bash
docker exec <container> pg_dump -U <user> <dbname> | gzip > backup.sql.gz
```

### MySQL / MariaDB backup

Target format: `container::mysql::dbname`

Example:
```
wordpress-db::mysql::wordpress
```

Runs:
```bash
docker exec <container> mysqldump <dbname> | gzip > backup.sql.gz
```

### Auto-discover databases

When creating a strategy with type `database`, click **Auto-Discover** to find all PostgreSQL and MySQL containers running on the server.

---

## 9. API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backups/s3` | List S3 configs |
| POST | `/api/backups/s3` | Create S3 config |
| DELETE | `/api/backups/s3/:id` | Delete S3 config |
| GET | `/api/backups/strategies` | List strategies |
| POST | `/api/backups/strategies` | Create strategy |
| PUT | `/api/backups/strategies/:id` | Update strategy |
| DELETE | `/api/backups/strategies/:id` | Delete strategy |
| POST | `/api/backups/strategies/:id/run` | Run strategy now |
| GET | `/api/backups/records` | List backup records |
| DELETE | `/api/backups/records/:id` | Delete record |
| POST | `/api/backups/records/:id/restore` | Restore backup |
| GET | `/api/backups/records/:id/download` | Download backup file |
