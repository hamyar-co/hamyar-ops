# Monitoring Guide

Real-time metrics, alert rules, incident tracking, Grafana integration, and the public status page.

---

## Table of Contents

1. [Server Metrics](#1-server-metrics)
2. [Application Monitoring](#2-application-monitoring)
3. [Alert Rules](#3-alert-rules)
4. [Incident Tracking](#4-incident-tracking)
5. [Error Log Aggregator](#5-error-log-aggregator)
6. [Grafana + Prometheus + Loki](#6-grafana--prometheus--loki)
7. [Public Status Page](#7-public-status-page)
8. [Monitoring Snapshots](#8-monitoring-snapshots)

---

## 1. Server Metrics

### Real-time metrics (host server)

Navigate to **Server** (`/server`) for live metrics of the ops server itself:

| Metric | Description |
|--------|-------------|
| CPU % | Per-core and overall utilization |
| RAM | Used / Total / Available |
| Swap | Swap usage |
| Disk | Per-mount usage and I/O |
| Network | RX/TX bytes per interface |
| Load Average | 1, 5, 15 minute averages |
| Uptime | Days, hours, minutes |
| Processes | Total / running / sleeping / zombie |

Metrics refresh every **15 seconds** via WebSocket (`server:metrics` event).

### Remote server metrics

Navigate to **Servers** → select a server → **View Metrics**:

Metrics are collected via SSH on demand:
```bash
# Commands run on the remote server:
cat /proc/loadavg
free -b
df -B1
cat /proc/net/dev
```

---

## 2. Application Monitoring

### PM2 process monitoring

Navigate to **PM2** (`/pm2`):

| Column | Description |
|--------|-------------|
| Name | PM2 process name |
| Status | online / stopped / errored |
| CPU % | Current CPU usage |
| RAM | Memory usage (MB) |
| Uptime | Time since last start |
| Restarts | Total restart count |
| PID | Process ID |

Actions: **Start, Stop, Restart, Reload, Delete, Logs**

Real-time updates via `pm2:status` WebSocket event (every 10 seconds).

### Docker container monitoring

Navigate to **Docker** (`/docker`) → Containers:

| Column | Description |
|--------|-------------|
| Name | Container name |
| Image | Docker image:tag |
| Status | running / paused / exited |
| CPU % | Live container CPU |
| RAM | Container memory usage |
| Uptime | Since container started |

Real-time stats via `docker:stats` WebSocket event.

### App health probes

Apps configured with a `healthUrl` are probed every **60 seconds**:

1. Go to **Applications** → select an app → **Edit** → set `Health URL`
   Example: `https://myapp.example.com/health`
2. Hamyar Ops HTTP GET the URL with a 5-second timeout
3. Status codes 200-399 = UP, anything else = DOWN

If the health check fails:
- App status changes to DOWN / DEGRADED
- An **incident** is created automatically
- Alert rules fire (if configured)

### SSL monitoring

SSL certificates for apps with a domain are checked every **12 hours**:
- Expiry date
- Days remaining
- Certificate issuer
- Chain validity

Alert is triggered if certificate expires in ≤ 14 days.

---

## 3. Alert Rules

Create threshold-based alerts on any metric.

### Create an alert rule

1. Go to **Monitoring** (`/monitoring`) → **Alert Rules** tab
2. Click **New Alert Rule**
3. Configure:

| Field | Options | Example |
|-------|---------|---------|
| Name | text | `High CPU on web server` |
| Metric | `cpu`, `ram`, `disk`, `network_rx`, `network_tx` | `cpu` |
| App Name | optional — scope to one app | `my-app` (or blank for server-wide) |
| Operator | `>`, `<`, `>=`, `<=` | `>` |
| Threshold | number | `85` (percent) |
| Duration | seconds (alert fires if condition persists) | `60` |
| Severity | INFO, WARNING, CRITICAL | `WARNING` |

### Example alert rules

```
Name: Critical CPU
Metric: cpu
Operator: >
Threshold: 90
Duration: 60
Severity: CRITICAL

Name: High Disk Usage
Metric: disk
Operator: >
Threshold: 80
Duration: 300
Severity: WARNING

Name: Memory Warning
Metric: ram
Operator: >
Threshold: 85
Duration: 120
Severity: WARNING
```

### Alert events

When an alert fires:
- An `AlertEvent` record is created in the database
- A `alert:triggered` WebSocket event is broadcast to all connected clients
- The notification bell in the header shows the alert

### Alert notifications

Built-in: WebSocket push (shown in dashboard).

Coming soon: Email, Slack, webhook integrations.

### API: list recent alert events

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://ops.example.com/api/monitoring/alert-events?limit=50
```

---

## 4. Incident Tracking

Incidents are automatically created when app health probes fail.

### Incident lifecycle

```
App health probe fails
  → AppIncident created (status: DOWN)
  → AppIncidentEvent created (DOWN, "Health check failed")
  → Continue probing every 60 seconds
  → If probe succeeds:
      → AppIncidentEvent created (UP, "Recovered")
      → AppIncident resolvedAt set, durationMs calculated
      → status: UP
```

### View incidents

Go to **Status** (`/status`) or **Monitoring → Incidents**:

| Column | Description |
|--------|-------------|
| App | Application name |
| Status | DOWN / DEGRADED / UP |
| Started | When downtime began |
| Duration | Total downtime |
| Events | Timeline of status changes |

### Incident statuses

| Status | Meaning |
|--------|---------|
| `UP` | Application is responding normally |
| `DOWN` | Application is not responding (health check fails) |
| `DEGRADED` | Application responds but with errors (5xx) |

### Manual incident resolution

If an incident is stuck in DOWN state after the app recovers:

```bash
# Via API
curl -X PATCH https://ops.example.com/api/app-health/incidents/:id/resolve \
  -H "Authorization: Bearer $TOKEN"
```

---

## 5. Error Log Aggregator

The centralized error log collects errors from all sources with deduplication.

### Sources

| Source | What's collected |
|--------|-----------------|
| `pm2` | stderr lines from PM2 managed processes |
| `nginx` | Nginx error log entries |
| `docker` | Container stderr output |
| `system` | journald / syslog errors |

### Fingerprinting and deduplication

Each error gets a fingerprint: `SHA256(sourceName + normalizedMessage)`.
Duplicate errors (same fingerprint) are not stored again — only the first occurrence is kept.

### View error logs

Go to **Error Logs** (`/error-logs`):

| Column | Description |
|--------|-------------|
| Source | pm2 / nginx / docker / system |
| App/Process | Source name |
| Message | Normalized error summary |
| Route | HTTP route (for nginx errors) |
| Time | First seen timestamp |
| Stack | Optional stack trace snippet |

### Filters

```
Filter by source:    pm2, nginx, docker, system
Filter by app name:  "my-app"
Search text:         "ECONNREFUSED", "TypeError"
Time range:          last 1h, 24h, 7d
```

### API

```bash
# Get recent errors
curl -H "Authorization: Bearer $TOKEN" \
  "https://ops.example.com/api/error-logs?source=pm2&limit=100"

# Get errors for a specific app
curl -H "Authorization: Bearer $TOKEN" \
  "https://ops.example.com/api/error-logs?sourceName=my-app"
```

---

## 6. Grafana + Prometheus + Loki

Install the full observability stack on any managed server from the dashboard.

### Install the monitoring stack

1. Go to **Observability** (`/observability`) → **Install** tab
2. Select the server to install on
3. Click **Install Stack**
4. Watch the Ansible playbook run in real-time

This installs via Ansible:
- **Prometheus** (port 9090) — metrics scraper
- **node-exporter** (port 9100) — system metrics exporter
- **Grafana** (port 3000) — metrics visualization
- **Loki** (port 3100) — log aggregation
- **Promtail** — log shipper to Loki

> **Note:** Ports 9090, 9100, 3000, 3100 are opened on the server's firewall automatically.

### Verify installation

```bash
# Check services on the target server
ssh root@your-server 'systemctl status prometheus grafana-server loki promtail'

# Access Grafana (port 3000)
open http://your-server-ip:3000
# Default: admin / admin (change immediately)
```

### Embed Grafana in Hamyar Ops

1. Go to **Observability → Grafana** tab
2. Select the server where Grafana is installed
3. The Grafana dashboard is embedded in an iframe

> Set `allow_embedding = true` in `/etc/grafana/grafana.ini` if embedding is blocked.

### Query logs with Loki

Go to **Observability → Loki** tab:

```
Query: {job="pm2"} |= "error"
Query: {job="nginx"} | logfmt | status >= 500
Time range: Last 1 hour
```

### Prometheus targets

Go to **Observability → Prometheus** tab to see the scrape config for all managed servers.

Copy and use in your Prometheus `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['server1-ip:9100']
        labels: { name: 'prod-web-1' }
      - targets: ['server2-ip:9100']
        labels: { name: 'prod-db-1' }
```

---

## 7. Public Status Page

A public-facing status page for your end users — no login required.

### Access

```
https://ops.example.com/status        (dashboard, requires login for full view)
https://ops.example.com/api/observability/status   (public JSON endpoint)
```

### What it shows

- Overall system status (All Systems Operational / Partial Outage / Major Outage)
- Per-application status with last-checked time
- Recent incidents with timeline

### Embed in your own site

```html
<!-- Status badge (JSON endpoint) -->
<script>
fetch('https://ops.example.com/api/observability/status')
  .then(r => r.json())
  .then(data => {
    document.getElementById('status').textContent =
      data.overall === 'operational' ? '✅ All systems operational' : '⚠️ ' + data.overall;
  });
</script>
<span id="status">Checking...</span>
```

---

## 8. Monitoring Snapshots

Hamyar Ops periodically saves monitoring snapshots for historical trend data.

Snapshots include:
- Total apps count
- Up / Down / Degraded counts
- Timestamp

These power the historical charts on the **Monitoring** page.

### View via API

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://ops.example.com/api/monitoring/snapshots?limit=24"

# Response:
[
  {
    "id": "...",
    "timestamp": "2026-07-11T10:00:00.000Z",
    "totalApps": 5,
    "upCount": 5,
    "downCount": 0,
    "degradedCount": 0
  }
]
```
