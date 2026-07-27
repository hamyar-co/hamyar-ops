# Security Hardening Guide

Production security checklist and hardening steps for Hamyar Ops.

---

## Built-in Application Controls (as of security hardening)

These are enforced by the API / UI code — still complete the checklist below for deployment.

| Control | Behavior |
|--------|----------|
| JWT secrets | Production **refuses to start** without strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥32 chars) |
| ValidationPipe | `whitelist` + `forbidNonWhitelisted` — unknown body fields rejected |
| Login lockout | 5 failed attempts → 15 minute lock (per username+IP) |
| Login rate limit | 5 req/min (Nest throttler) + Nginx `ops_login` zone |
| Refresh cookies | `httpOnly`, `sameSite=strict`, path-scoped to `/api/auth` |
| JWT source | Bearer header only (query-string tokens rejected) |
| File browser | Path traversal blocked; prefix-safe root check; forbidden roots (`/`, `/etc`, …) |
| Load testing | ADMIN only; SSRF blocklist (private/link-local/metadata IPs); caps on connections/duration |
| Terminal WS | ADMIN only; session ownership enforced; docker id / path sanitization |
| Secrets API | ADMIN only |
| Helmet + HSTS | Enabled; HSTS on in production |
| Next.js headers | CSP, X-Frame-Options, nosniff, Permissions-Policy |
| Trust proxy | Enabled for correct client IP behind Nginx |

---

## Pre-Launch Security Checklist

### Authentication
- [ ] Change default admin password (`admin123` → strong password)
- [ ] Enable TOTP 2FA on the admin account (Settings → 2FA)
- [ ] Set `JWT_ACCESS_TTL=900` (15 minutes; default is now 900s)
- [ ] Generate unique `JWT_ACCESS_SECRET` (min 32 chars): `openssl rand -hex 32`
- [ ] Generate unique `JWT_REFRESH_SECRET` (different from access): `openssl rand -hex 32`
- [ ] Set unique `SECRETS_ENCRYPTION_KEY` (exactly 32 chars)
- [ ] Set `NODE_ENV=production`

### Secrets / Files
- [ ] `chmod 600 /opt/hamyar/ops/api/.env`
- [ ] `chown root:root /opt/hamyar/ops/api/.env`
- [ ] `FILE_BROWSER_ROOTS` does NOT contain `/`, `/etc`, `/etc/shadow`, `/root`

### Database
- [ ] PostgreSQL password changed from `opspassword`
- [ ] Redis password changed from `opsredispassword`
- [ ] Database port 5433 NOT accessible externally (bound to `127.0.0.1`)
- [ ] Redis port 6380 NOT accessible externally (bound to `127.0.0.1`)

### Network
- [ ] UFW enabled: `ufw status`
- [ ] Only ports 22, 80, 443 open externally
- [ ] Rate limiting configured in Nginx (see below)

### SSL / TLS
- [ ] HTTPS enabled with valid Let's Encrypt certificate
- [ ] HTTP redirects to HTTPS
- [ ] Certificate auto-renews: `systemctl status certbot.timer`
- [ ] TLS 1.2+ only (Nginx default since 1.15)

---

## Nginx Security Hardening

Rate-limit zones + hardened server block ship in:

- `deploy/nginx/rate-limit-zones.conf` — include from the **http** context
- `deploy/nginx/ops.conf` — TLS server with headers, HSTS, CSP, login/API rate limits

```bash
# In /etc/nginx/nginx.conf inside http { }:
include /opt/hamyar/ops/deploy/nginx/rate-limit-zones.conf;

# Enable site
ln -sf /opt/hamyar/ops/deploy/nginx/ops.conf /etc/nginx/sites-enabled/hamyar-ops.conf
nginx -t && systemctl reload nginx
```

Optional: set `SSH_STRICT_HOST_KEY=false` only if you must keep the old
`StrictHostKeyChecking=no` behavior for remote file ops (not recommended).

---

## SSH Hardening

Harden the SSH daemon on your ops server:

```bash
cat >> /etc/ssh/sshd_config <<EOF
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 60
ClientAliveCountMax 3
AllowGroups root  # or a specific group
EOF

systemctl reload sshd
```

---

## PostgreSQL Security

```bash
# Verify PostgreSQL only listens on localhost
docker exec hamyar-ops-postgres psql -U opsuser -c "SHOW listen_addresses;"
# Should show: localhost or 127.0.0.1

# Rotate the password
docker exec hamyar-ops-postgres \
  psql -U opsuser -c "ALTER USER opsuser PASSWORD 'new-strong-password-here';"

# Update .env
sed -i 's/opspassword/new-strong-password-here/' /opt/hamyar/ops/api/.env
pm2 restart hamyar-ops-api
```

---

## Redis Security

```bash
# Verify Redis only listens on localhost
docker exec hamyar-ops-redis redis-cli -a your-password CONFIG GET bind
# Should show: 127.0.0.1

# Test password is required
docker exec hamyar-ops-redis redis-cli PING
# Should return: NOAUTH Authentication required
```

---

## Regular Security Tasks

### Weekly
- Review audit logs for unusual activity
- Check for failed login attempts: `grep "login failed" /var/log/hamyar/ops-api-error.log`
- Review active sessions

### Monthly
- Rotate SSH keys across fleet (Ansible → rotate-keys)
- Update all packages: `apt-get update && apt-get upgrade`
- Update Docker images: `docker pull postgres:15-alpine && docker pull redis:7-alpine`
- Check SSL certificate expiry (Monitoring page or: `certbot certificates`)

### Quarterly
- Rotate JWT secrets (forces all users to re-login)
- Rotate `SECRETS_ENCRYPTION_KEY` (requires re-encrypting all stored secrets)
- Review user accounts and remove stale ones

---

## Incident Response Quick Reference

```bash
# Lock out a compromised user immediately
curl -X PATCH https://ops.example.com/api/users/:id \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"disabled": true}'

# Invalidate ALL sessions (all users must re-login)
NEW_SECRET=$(openssl rand -hex 32)
sed -i "s/JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$NEW_SECRET/" /opt/hamyar/ops/api/.env
sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(openssl rand -hex 32)/" /opt/hamyar/ops/api/.env
pm2 restart hamyar-ops-api

# Block a malicious IP immediately
ufw deny from 203.0.113.99 to any
ufw reload

# Emergency: Block ALL external access
ufw default deny incoming
ufw reload
```
