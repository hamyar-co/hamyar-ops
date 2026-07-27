# Firewall Guide

Manage UFW firewall rules and network access modes from the Hamyar Ops dashboard.

---

## Overview

The Network module provides a UI for **UFW (Uncomplicated Firewall)** rules on the ops server. Rules are stored in the database and synced with UFW on each change.

Navigate to **Network** (`/network`).

---

## Firewall Status

The Network page shows:
- **UFW status:** enabled / disabled
- **Default policy:** deny incoming, allow outgoing
- **Rules list:** all current rules with port, protocol, direction, action, description

---

## Add a Firewall Rule

1. Go to **Network → Add Rule**
2. Fill in:

| Field | Example | Description |
|-------|---------|-------------|
| Port | `3000` | Port number (or range: `3000:3010`) |
| Protocol | `tcp` | `tcp`, `udp`, or `any` |
| Direction | `IN` | `IN` (incoming) or `OUT` (outgoing) |
| Action | `ALLOW` | `ALLOW` or `DENY` |
| From IP | `192.168.1.0/24` | Optional — restrict to source IP/CIDR |
| Description | `Grafana` | Label for the rule |

3. Click **Add Rule**

### Common rule examples

```bash
# Allow web traffic
Port: 80, Protocol: tcp, Action: ALLOW

# Allow HTTPS
Port: 443, Protocol: tcp, Action: ALLOW

# Allow SSH from specific IP only
Port: 22, Protocol: tcp, Action: ALLOW, From: 203.0.113.10

# Block a malicious IP
Port: any, Protocol: any, Action: DENY, From: 203.0.113.99

# Allow Grafana for monitoring team
Port: 3000, Protocol: tcp, Action: ALLOW, From: 10.0.0.0/8
```

---

## Delete a Rule

**Network → Rules → [rule] → Delete → Confirm**

The rule is removed from UFW immediately.

---

## Network Access Modes

Three preset modes for locking down access:

### Enable UFW (default production mode)

```
Network → Enable UFW
```

Sets:
- Default deny incoming
- Default allow outgoing
- Allows: 22, 80, 443

### Disable All External Access

```
Network → Disable All External
```

Temporarily blocks all incoming connections except from `127.0.0.1`.

**Use case:** During an emergency, maintenance, or security incident.

> ⚠️ This will lock you out of SSH if run remotely — ensure you have console/VNC access.

### Restrict to Localhost

```
Network → Restrict to Localhost
```

All ports restricted to localhost only. Useful during maintenance when you want to ensure no external traffic hits the app.

---

## Quick Rule Reference

### Standard production setup

```
22/tcp  ALLOW     SSH
80/tcp  ALLOW     HTTP
443/tcp ALLOW     HTTPS
```

### With monitoring stack

```
22/tcp  ALLOW
80/tcp  ALLOW
443/tcp ALLOW
9090/tcp ALLOW FROM 10.0.0.0/8    # Prometheus (internal only)
3000/tcp ALLOW FROM 10.0.0.0/8    # Grafana (internal only)
```

### Development server

```
22/tcp  ALLOW
80/tcp  ALLOW
443/tcp ALLOW
3005/tcp ALLOW FROM your.dev.ip   # API direct access for testing
```

---

## API Reference

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/network/rules` | Any | List all rules |
| POST | `/api/network/rules` | ADMIN | Add rule |
| DELETE | `/api/network/rules/:id` | ADMIN | Remove rule |
| POST | `/api/network/enable` | ADMIN | Enable UFW |
| POST | `/api/network/disable` | ADMIN | Disable UFW |
| POST | `/api/network/disable-external` | ADMIN | Block all external |
| POST | `/api/network/restrict-localhost` | ADMIN | Restrict to localhost |

### Add rule via API

```bash
curl -X POST https://ops.example.com/api/network/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "port": "9090",
    "protocol": "tcp",
    "direction": "IN",
    "action": "ALLOW",
    "fromIp": "10.0.0.0/8",
    "description": "Prometheus internal"
  }'
```
