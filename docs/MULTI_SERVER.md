# Multi-Server Fleet Management Guide

Manage any number of remote servers from the Hamyar Ops dashboard — metrics, terminals, deployments, Ansible automation, and more.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Add Your First Server](#2-add-your-first-server)
3. [SSH Key Management](#3-ssh-key-management)
4. [Server Operations](#4-server-operations)
5. [Remote Metrics](#5-remote-metrics)
6. [Fleet Dashboard](#6-fleet-dashboard)
7. [Bootstrap a New Server with Ansible](#7-bootstrap-a-new-server-with-ansible)
8. [Tags and Filtering](#8-tags-and-filtering)
9. [Drift Detection](#9-drift-detection)
10. [SSH Key Rotation](#10-ssh-key-rotation)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Overview

The multi-server system lets you manage **any VPS, bare metal, or cloud server** reachable via SSH — regardless of provider. There's no cloud API required; if you can SSH into it, Hamyar Ops can manage it.

```
Hamyar Ops Server
     │
     ├── SSH (key or password) ──► Server 1 (Production)
     ├── SSH (key or password) ──► Server 2 (Staging)
     ├── SSH (key or password) ──► Server 3 (Database)
     └── SSH (key or password) ──► Server N ...
```

**Stored per server:**
- Connection details (host, port, username)
- SSH key reference (from the key store)
- Tags for grouping
- Last ping time and status
- Active/inactive toggle

---

## 2. Add Your First Server

### Via the dashboard

1. Navigate to **Servers** (`/servers`)
2. Click **Add Server**
3. Fill in:

| Field | Example | Notes |
|-------|---------|-------|
| Name | `prod-web-1` | Unique display name |
| Host | `91.220.113.171` | IP address or hostname |
| Port | `22` | SSH port (default 22) |
| Username | `root` | SSH username |
| SSH Key | (select from key store) | Recommended over password |
| Tags | `production,web` | Comma-separated for grouping |

4. Click **Test Connection** before saving — confirms SSH works
5. Click **Save Server**

### Via API

```bash
curl -X POST https://ops.example.com/api/servers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "prod-web-1",
    "host": "91.220.113.171",
    "port": 22,
    "username": "root",
    "sshKeyId": "clx...",
    "tags": ["production", "web"],
    "isActive": true
  }'
```

---

## 3. SSH Key Management

SSH keys are stored **encrypted** in the database using AES-256-GCM. Passphrases are supported.

### Add an SSH key

1. Go to **Servers → SSH Keys** tab
2. Click **Add SSH Key**
3. Fill in:
   - **Name** — e.g. `hetzner-prod-key`
   - **Private Key** — paste the full content of your `id_rsa` or `id_ed25519`
   - **Public Key** — optional, stored for reference
   - **Passphrase** — if your key is encrypted
4. Click **Save Key**

### Generate a new key pair

```bash
# On your local machine or the ops server:
ssh-keygen -t ed25519 -C "hamyar-ops-fleet" -f ~/.ssh/hamyar_fleet

# Copy to target server:
ssh-copy-id -i ~/.ssh/hamyar_fleet.pub root@target-server-ip

# Then paste ~/.ssh/hamyar_fleet (private key) into the SSH Keys UI
```

### Security notes

- Private keys are encrypted with `SECRETS_ENCRYPTION_KEY` before storage
- Temp key files written during SSH operations are:
  - Created with `chmod 600`
  - In system temp directory
  - Deleted immediately after the connection closes (in `finally` block)
- Never logged, never included in API responses

---

## 4. Server Operations

From the **Servers** page, each server has these actions:

### Ping

Tests TCP connectivity and SSH handshake. Updates `lastPingAt` and `lastPingOk`.

```
Servers → [Server row] → Ping button
```

### Execute Remote Command

Run any shell command on a managed server:

```
Servers → [Server row] → Execute → enter command
```

Example commands:
```bash
df -h                    # disk usage
free -m                  # memory
cat /var/log/syslog | tail -100   # recent syslog
systemctl status nginx   # nginx status
docker ps                # running containers
```

Output streams back in real-time.

### Reboot

```
Servers → [Server row] → Reboot → Confirm
```

Runs: `sudo shutdown -r now "Reboot requested via hamyar-ops"`

> ⚠️ The server will go offline briefly. Ping will show as failed until it comes back up.

### Shutdown

```
Servers → [Server row] → Shutdown → Confirm
```

Runs: `sudo shutdown -h now "Shutdown requested via hamyar-ops"`

> ⚠️ **Destructive.** The server will not come back online automatically.

---

## 5. Remote Metrics

View CPU, RAM, disk, and network metrics from any managed server:

1. Go to **Servers → [Server name] → Metrics** tab
2. Metrics are fetched via SSH on demand (not continuously polled)

```
Servers → select server → View Metrics
```

**Metrics collected:**
- CPU usage %
- RAM used / total
- Disk usage per mount
- Network RX/TX bytes
- Uptime
- Load average

---

## 6. Fleet Dashboard

The **Servers** page shows all managed servers in a table:

| Column | Description |
|--------|-------------|
| Name | Display name with link |
| Host | IP / hostname |
| Status | 🟢 Online / 🔴 Offline (based on last ping) |
| Last Ping | Time of last successful ping |
| Tags | Grouped labels |
| Actions | Ping, Metrics, Execute, Reboot, Edit, Delete |

### Filter by tag

```
Servers → filter input → type "production"
```

Shows only servers tagged with `production`.

---

## 7. Bootstrap a New Server with Ansible

After adding a new server, run the built-in **bootstrap** playbook to configure it completely:

### Steps

1. Add the server in **Servers** (SSH key or password)
2. Go to **Ansible → Playbooks**
3. Find `bootstrap` (built-in, cannot be deleted)
4. Click **Run**
5. Pick your new server from the list
6. Click **Execute**
7. Watch the live log output

### What bootstrap installs

```yaml
- Node.js 22 (via NodeSource)
- PM2 (global npm package)
- Docker Engine + Docker Compose plugin
- Nginx
- UFW (firewall, configured: allow 22, 80, 443)
- build-essential (compilers)
```

### Expected output

```
PLAY [Bootstrap server] ***
TASK [Update apt cache] *** ok
TASK [Install dependencies] *** ok
TASK [Install Node.js 22] *** changed
TASK [Install PM2] *** changed
TASK [Install Docker] *** changed
TASK [Enable UFW] *** changed
TASK [Allow SSH] *** ok
TASK [Allow HTTP] *** ok
TASK [Allow HTTPS] *** ok
TASK [Enable Nginx] *** ok
PLAY RECAP *** prod-web-1: ok=10 changed=5 failed=0
```

---

## 8. Tags and Filtering

Tags help you group servers by role, environment, or location.

### Recommended tag conventions

```
environment: production, staging, development
role:        web, database, cache, worker
provider:    hetzner, digitalocean, aws
region:      eu-de, us-east, ap-sg
```

### Example: target all production servers with Ansible

1. Tag your production servers with `production`
2. In Ansible: **Run Playbook → filter servers by tag** `production`
3. All matching servers receive the playbook

---

## 9. Drift Detection

Drift detection checks whether a server's actual configuration matches the expected state.

### Run a drift check

1. Go to **Ansible → Drift** tab
2. Select a server (or all servers)
3. Click **Check Drift**
4. Results appear in seconds

### Reading drift results

```
✅ nodejs     expected: >=22   actual: v22.4.0   OK
✅ pm2        expected: installed   actual: 5.4.3   OK
❌ docker     expected: installed   actual: NOT_INSTALLED   DRIFT
✅ nginx      expected: installed   actual: nginx/1.24.0   OK
```

### Auto-remediate drift

When drift is detected, you can immediately run the **bootstrap** playbook to fix it:

1. See `docker: DRIFT` in results
2. Click **Fix with Bootstrap** (runs bootstrap playbook on that server)

---

## 10. SSH Key Rotation

Rotate SSH keys across your entire fleet from the dashboard:

1. Generate a new key pair (or paste an existing public key)
2. Go to **Ansible → Playbooks → rotate-keys**
3. Click **Run**
4. Paste the **new public key** in the `new_public_key` variable
5. Optionally paste the **old public key** in `remove_old_key`
6. Select all servers you want to rotate
7. Click **Execute**

The playbook:
1. Adds the new public key to `~/.ssh/authorized_keys`
2. Removes the old key (if `remove_old_key` is set)

> ✅ **Safety:** The new key is added **before** the old one is removed, so you're never locked out.

After rotation:
1. Upload the new private key to the SSH Key Store
2. Update each server's SSH key reference

---

## 11. Troubleshooting

### "Connection refused" when testing connection

```bash
# Verify SSH is running on the server
nc -zv your-server-ip 22

# Verify from the ops server
ssh root@your-server-ip 'echo connected'
```

### "Permission denied (publickey)"

```bash
# Check the key is in authorized_keys on the target server
cat ~/.ssh/authorized_keys

# Test auth manually
ssh -i /path/to/key -o StrictHostKeyChecking=no root@your-server-ip 'echo ok'
```

### Ping shows offline but server is running

- Check if the SSH port changed (default 22)
- Check if UFW is blocking the ops server's IP
- Try **Execute** with `echo ping` — if that works, ping logic may need a health check tweak

### Ansible playbook fails immediately

```bash
# Test ansible connectivity manually (on the ops server)
ansible all -i "your-server-ip," -u root --private-key /tmp/your-key.pem -m ping
```

Common causes:
- Python not installed on target (`apt-get install python3`)
- Ansible not installed on ops server (`apt-get install ansible`)
- Host key verification issues (use `-o StrictHostKeyChecking=no` in inventory)
