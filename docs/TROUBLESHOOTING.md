# Troubleshooting Guide

Common issues and their solutions for Hamyar Ops.

---

## Table of Contents

1. [Database Issues](#1-database-issues)
2. [API Startup Issues](#2-api-startup-issues)
3. [Frontend Issues](#3-frontend-issues)
4. [Authentication Issues](#4-authentication-issues)
5. [Deploy Issues](#5-deploy-issues)
6. [Terminal Issues](#6-terminal-issues)
7. [Ansible Issues](#7-ansible-issues)
8. [Monitoring Issues](#8-monitoring-issues)
9. [Performance](#9-performance)
10. [Log Locations](#10-log-locations)

---

## 1. Database Issues

### "Table does not exist" errors

**Symptom:**
```
PrismaClientKnownRequestError: The table `public.ManagedServer` does not exist
```

**Cause:** Database migrations haven't been run.

**Fix:**
```bash
ssh root@your-server
cd /opt/hamyar/ops/api
node_modules/.bin/prisma migrate deploy
pm2 restart hamyar-ops-api
```

### "Can't reach database server"

**Symptom:**
```
PrismaClientInitializationError: Can't reach database server at localhost:5433
```

**Fix:**
```bash
# Check if postgres container is running
docker ps | grep postgres

# If not running, start it:
cd /opt/hamyar/ops
docker compose up -d postgres

# Wait for healthy:
docker inspect hamyar-ops-postgres | grep Status
```

### Database connection refused after server reboot

```bash
# Postgres container doesn't auto-start unless configured:
docker update --restart unless-stopped hamyar-ops-postgres
docker update --restart unless-stopped hamyar-ops-redis

# Or add restart: unless-stopped to docker-compose.yml (already there in v1.1.0+)
```

### Migration fails with "already exists"

```bash
# Check migration status
cd /opt/hamyar/ops/api
node_modules/.bin/prisma migrate status

# If a migration is stuck in "pending" but already applied:
# Manually mark it as applied:
node_modules/.bin/prisma migrate resolve --applied 20260711000001_add_iac_pipeline_registry
```

---

## 2. API Startup Issues

### API won't start — "Cannot find module"

```bash
# Rebuild node_modules for Linux (Mac cross-compile issue)
cd /opt/hamyar/ops/api
find node_modules -name '*.node' -delete
pnpm rebuild
pm2 restart hamyar-ops-api
```

### "JWT_ACCESS_SECRET is not defined"

```bash
cat /opt/hamyar/ops/api/.env | grep JWT_ACCESS_SECRET
# If missing or empty:
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)" >> /opt/hamyar/ops/api/.env
pm2 restart hamyar-ops-api
```

### API starts but health check fails

```bash
# Check API is actually running
pm2 status | grep hamyar-ops-api

# Check logs for errors
pm2 logs hamyar-ops-api --lines 50 --nostream

# Try curl locally
curl -s http://localhost:3005/api/monitoring/health
```

### Port 3005 already in use

```bash
lsof -i :3005
# Kill whatever is using it, then restart:
pm2 restart hamyar-ops-api
```

---

## 3. Frontend Issues

### Dashboard shows "Failed to fetch" or blank

**Check:**
```bash
# Is the API running?
curl -s http://localhost:3005/api/monitoring/health

# Is nginx routing correctly?
curl -s https://ops.example.com/api/monitoring/health

# Nginx logs:
tail -50 /var/log/nginx/error.log
```

### WebSocket disconnects immediately

```bash
# Check nginx WebSocket proxy config
grep -A 10 "socket.io" /etc/nginx/sites-available/ops.example.com
# Must have:
# proxy_http_version 1.1;
# Upgrade and Connection headers
# proxy_read_timeout 86400;

nginx -t && nginx -s reload
```

### "Failed to load chunks" or JS errors

```bash
# Rebuild and redeploy the web:
cd /path/to/hamyar-ops
NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL="https://ops.example.com" \
  pnpm --filter @hamyar-ops/web build

# Re-run deploy.sh
./deploy/deploy.sh
```

### UI shows wrong API URL

The `NEXT_PUBLIC_API_URL` is baked at build time. If you see requests going to the wrong URL:

```bash
# Check build environment:
grep NEXT_PUBLIC /path/to/hamyar-ops/apps/web/.next/server/app/layout.js | head -5

# Rebuild with correct URL:
NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL="https://ops.example.com" pnpm build
```

---

## 4. Authentication Issues

### "Invalid credentials" on fresh install

```bash
# Re-run the seed to create admin user:
cd /opt/hamyar/ops/api
node prisma/seed.js

# Default credentials: admin / admin123
```

### JWT expired — can't log in

```bash
# If access token is expired, try refresh:
curl -X POST https://ops.example.com/api/auth/refresh \
  -H "Authorization: Bearer <refreshToken>"

# If refresh also expired, just log in again with credentials.
```

### TOTP code "invalid"

- Ensure your device clock is synced (NTP)
- Use backup code if available: Settings → 2FA → Use Backup Code
- If locked out completely:

```bash
# Reset TOTP via database (emergency)
psql postgresql://opsuser:opspassword@localhost:5433/hamyar_ops -c \
  "UPDATE \"User\" SET \"totpEnabled\" = false, \"totpSecret\" = null WHERE username = 'admin';"
pm2 restart hamyar-ops-api
```

### "Unauthorized" on all API calls

```bash
# Check if JWT_ACCESS_SECRET changed since tokens were issued:
# All existing tokens are invalid after secret rotation.
# Solution: log in again.

# If secret was accidentally changed, restore it and restart:
nano /opt/hamyar/ops/api/.env
pm2 restart hamyar-ops-api
```

---

## 5. Deploy Issues

### `deploy.sh` fails with "rsync: command not found"

```bash
# Install rsync on your local Mac/Linux:
brew install rsync   # macOS
apt-get install rsync  # Linux
```

### "Permission denied" during rsync

```bash
# Verify SSH key works:
ssh root@your-server 'echo ok'

# If using custom key:
SSH_AUTH_SOCK=/path/to/agent ssh root@your-server 'echo ok'
```

### Prisma migration fails on server

```bash
ssh root@your-server
cd /opt/hamyar/ops/api
cat .env | grep DATABASE_URL  # verify it's set

# Run manually:
DATABASE_URL="postgresql://..." node_modules/.bin/prisma migrate deploy

# If migration file is missing on server (forgot to commit it):
# Commit the migration locally, push to git, redeploy
```

### PM2 processes not starting after deploy

```bash
ssh root@your-server

# Check ecosystem file:
cat /opt/hamyar/ops/ecosystem.ops.config.js

# Start fresh:
pm2 delete hamyar-ops-api hamyar-ops-ui 2>/dev/null || true
pm2 start /opt/hamyar/ops/ecosystem.ops.config.js
pm2 save
pm2 status
```

### GitHub Actions deploy fails at health check

```bash
# The API might be slow to start:
# Increase sleep in deploy.yml:
- run: sleep 30 && curl -f http://ops.example.com/api/monitoring/health
#            ↑ was 15, increase to 30
```

---

## 6. Terminal Issues

### Terminal shows blank / won't connect

```bash
# Check SSH config in .env:
grep SSH_ /opt/hamyar/ops/api/.env

# Test SSH manually from the ops server:
ssh -o StrictHostKeyChecking=no root@localhost -i /root/.ssh/id_rsa 'echo ok'
```

### "Authentication failed" in terminal

```bash
# Ensure SSH key exists on the host:
ls -la /root/.ssh/id_rsa
# If missing:
ssh-keygen -t ed25519 -f /root/.ssh/id_rsa -N ""
# Then add it to authorized_keys if not already there
```

### Terminal disconnects after idle

This is expected behavior (SSH keepalive timeout). The terminal will reconnect automatically on next keystroke.

To increase the timeout, edit the server's SSH config:
```bash
echo "ClientAliveInterval 60" >> /etc/ssh/sshd_config
echo "ClientAliveCountMax 10" >> /etc/ssh/sshd_config
systemctl reload sshd
```

---

## 7. Ansible Issues

### "ansible: command not found"

```bash
# Install Ansible on the ops server (not target servers):
apt-get install -y ansible
ansible --version
```

### "Python not found" on target server

```bash
# Ansible requires Python on target servers:
ssh root@target-server 'apt-get install -y python3'
```

### Playbook fails with "Host key verification failed"

This is handled automatically — the inventory uses `-o StrictHostKeyChecking=no`. If still failing:

```bash
# Clear known_hosts entry for the target:
ssh-keygen -R target-server-ip
# Then re-run the playbook
```

### "Permission denied" during playbook

```bash
# Check the SSH key is correct for the target server:
ssh -i /tmp/ansible-key root@target 'echo connected'

# Or test with password:
ansible all -i "target," -u root --ask-pass -m ping
```

---

## 8. Monitoring Issues

### Metrics not updating (stuck values)

```bash
# Check WebSocket connection in browser console:
# Should see: "Socket connected"

# If disconnected, check nginx WebSocket config:
grep -A 5 "socket.io" /etc/nginx/sites-available/ops.example.com
```

### Health probes not running

```bash
# Check BullMQ app-health queue:
ssh root@your-server
cd /opt/hamyar/ops/api

# Connect to Redis and check queues:
docker exec hamyar-ops-redis redis-cli -a opsredispassword \
  LLEN bull:app-health:waiting
```

### SSL certificate check fails

```bash
# Test SSL manually:
echo | openssl s_client -connect myapp.example.com:443 -servername myapp.example.com 2>/dev/null \
  | openssl x509 -noout -dates
```

---

## 9. Performance

### API high memory usage

```bash
# Check current usage:
pm2 describe hamyar-ops-api | grep memory

# The PM2 config has max_memory_restart: 512M
# If consistently near limit, increase it:
nano /opt/hamyar/ops/ecosystem.ops.config.js
# Change: max_memory_restart: '1024M'
pm2 restart hamyar-ops-api
```

### Slow API responses

```bash
# Check database query performance:
psql postgresql://opsuser:opspassword@localhost:5433/hamyar_ops \
  -c "SELECT pid, query_start, state, query FROM pg_stat_activity WHERE state = 'active';"
```

### Redis connection errors

```bash
# Check Redis is running:
docker ps | grep redis
docker exec hamyar-ops-redis redis-cli -a opsredispassword ping
# Should return: PONG
```

---

## 10. Log Locations

| Log | Path | Command |
|-----|------|---------|
| API stdout | `/var/log/hamyar/ops-api-out.log` | `tail -f /var/log/hamyar/ops-api-out.log` |
| API stderr | `/var/log/hamyar/ops-api-error.log` | `tail -f /var/log/hamyar/ops-api-error.log` |
| UI stdout | `/var/log/hamyar/ops-ui-out.log` | `tail -f /var/log/hamyar/ops-ui-out.log` |
| UI stderr | `/var/log/hamyar/ops-ui-error.log` | `tail -f /var/log/hamyar/ops-ui-error.log` |
| Nginx access | `/var/log/nginx/access.log` | `tail -f /var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` | `tail -f /var/log/nginx/error.log` |
| PM2 combined | — | `pm2 logs --lines 100` |
| System | `/var/log/syslog` | `tail -f /var/log/syslog` |

### Quick diagnostic

```bash
# One-liner: all important status in one shot
pm2 status && \
  curl -s http://localhost:3005/api/monitoring/health && \
  docker ps --format "{{.Names}}: {{.Status}}" | grep hamyar
```
