# SSH & Security Guide

SSH key management, TOTP two-factor authentication, RBAC, audit logging, and production security hardening.

---

## Table of Contents

1. [SSH Key Management](#1-ssh-key-management)
2. [TOTP Two-Factor Authentication](#2-totp-two-factor-authentication)
3. [Role-Based Access Control (RBAC)](#3-role-based-access-control-rbac)
4. [Audit Logging](#4-audit-logging)
5. [Session Management](#5-session-management)
6. [Secrets Encryption](#6-secrets-encryption)
7. [Production Security Checklist](#7-production-security-checklist)
8. [Incident Response](#8-incident-response)

---

## 1. SSH Key Management

### Add an SSH key

1. Go to **Servers → SSH Keys** tab
2. Click **Add SSH Key**
3. Enter:
   - **Name** — descriptive label (e.g. `hetzner-prod`)
   - **Private Key** — full PEM content including header/footer
   - **Public Key** — optional reference
   - **Passphrase** — if the key is encrypted
4. Click **Save**

The key is encrypted with AES-256-GCM before storage using `SECRETS_ENCRYPTION_KEY`.

### Generate a key pair

```bash
# Generate Ed25519 key (recommended — more secure and smaller than RSA)
ssh-keygen -t ed25519 -C "hamyar-fleet-$(date +%Y%m)" -f ~/.ssh/hamyar_fleet

# Or RSA 4096 if Ed25519 is not supported on old servers
ssh-keygen -t rsa -b 4096 -C "hamyar-fleet" -f ~/.ssh/hamyar_fleet

# Show public key (paste to target server's authorized_keys)
cat ~/.ssh/hamyar_fleet.pub

# Show private key (paste into Hamyar Ops SSH Key form)
cat ~/.ssh/hamyar_fleet
```

### Add key to a target server

```bash
# Method 1: ssh-copy-id (easiest)
ssh-copy-id -i ~/.ssh/hamyar_fleet.pub root@your-server-ip

# Method 2: Manual
ssh root@your-server-ip \
  "echo 'ssh-ed25519 AAAA...' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# Verify
ssh -i ~/.ssh/hamyar_fleet root@your-server-ip 'echo connected'
```

### Key security

- Private keys are stored **encrypted** (AES-256-GCM + random IV per key)
- Temp files during SSH operations are `chmod 600` and deleted in `finally` blocks
- Keys are never included in API list responses — only `name`, `id`, and `hasPassphrase` are returned
- The raw private key is only used in-memory during SSH connection setup

### Rotate keys across fleet

See [Ansible Guide → SSH Key Rotation](ANSIBLE.md#8-ssh-key-rotation).

---

## 2. TOTP Two-Factor Authentication

TOTP (Time-based One-Time Password) adds a second factor to every login.

### Enable 2FA

1. Go to **Settings → Two-Factor Authentication**
2. A QR code appears — scan with any TOTP app:
   - Google Authenticator
   - Authy
   - 1Password
   - Bitwarden
   - Any RFC 6238 compatible app
3. Enter the 6-digit code from your app to confirm
4. **Save your backup codes** in a secure place — they're shown only once

### Login flow with 2FA enabled

```
1. Enter username + password → POST /api/auth/login
2. If 2FA enabled: enter 6-digit TOTP code → POST /api/auth/totp/verify
3. Receive access token + refresh token
```

### Backup codes

Each account gets 10 one-time backup codes. Use one if you lose access to your TOTP device:

```
Settings → Two-Factor Authentication → Show Backup Codes
```

Each code can only be used once. Generate new codes after using one.

### Disable 2FA

```
Settings → Two-Factor Authentication → Disable 2FA → enter current TOTP code
```

### API: TOTP flow

```bash
# Step 1: Regular login
curl -X POST https://ops.example.com/api/auth/login \
  -d '{"username":"admin","password":"your-password"}'
# Returns: { requiresTOTP: true, tempToken: "..." }

# Step 2: TOTP verification
curl -X POST https://ops.example.com/api/auth/totp/verify \
  -H "Authorization: Bearer temp-token" \
  -d '{"code":"123456"}'
# Returns: { accessToken: "...", refreshToken: "..." }

# Or use backup code:
curl -X POST https://ops.example.com/api/auth/totp/verify \
  -H "Authorization: Bearer temp-token" \
  -d '{"backupCode":"abc123def456"}'
```

---

## 3. Role-Based Access Control (RBAC)

Hamyar Ops has two roles:

| Role | Description | Default |
|------|-------------|---------|
| `ADMIN` | Full access — create, modify, delete, run commands | First user |
| `VIEWER` | Read-only — view dashboards, metrics, logs | New users |

### Role permissions

| Action | ADMIN | VIEWER |
|--------|-------|--------|
| View dashboards, metrics, logs | ✅ | ✅ |
| Start/stop/restart applications | ✅ | ❌ |
| Deploy via pipelines | ✅ | ❌ |
| Create/edit/delete resources | ✅ | ❌ |
| Run Ansible playbooks | ✅ | ❌ |
| Execute Terraform | ✅ | ❌ |
| SSH terminal access | ✅ | ❌ |
| File manager write operations | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| View audit logs | ✅ | ✅ |

### Manage users

1. Go to **Users** (`/users`)
2. Click **New User**
3. Set username, email, password, role
4. Click **Create**

Or via API (ADMIN only):
```bash
curl -X POST https://ops.example.com/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "email": "alice@example.com",
    "password": "SecurePass123!",
    "role": "VIEWER"
  }'
```

### Change a user's role

```bash
curl -X PATCH https://ops.example.com/api/users/:id \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"role": "ADMIN"}'
```

---

## 4. Audit Logging

Every significant action in Hamyar Ops is written to the `AuditLog` table.

### What's logged

| Category | Events |
|----------|--------|
| Auth | Login, logout, failed login, TOTP verify, password change |
| Applications | Deploy, rollback, restart, stop, start, delete |
| Servers | Add, edit, delete, ping, execute command, reboot, shutdown |
| Files | Upload, download, delete, edit, rename, create |
| Users | Create, update, delete, role change |
| Settings | Any settings change |
| Backups | Start, complete, fail, restore |
| Network | Firewall rule add/remove/enable/disable |
| Pipelines | Trigger, complete, fail, rollback |
| Ansible | Playbook run, complete, fail |
| Terraform | Plan, apply, destroy |

### Audit log record

```json
{
  "id": "uuid-...",
  "userId": "user-uuid",
  "user": { "username": "admin" },
  "action": "DEPLOY",
  "resourceType": "Application",
  "resourceId": "my-app",
  "metadata": {
    "version": "v1.2.0",
    "commitHash": "abc123",
    "strategy": "rolling"
  },
  "ipAddress": "192.168.1.100",
  "createdAt": "2026-07-11T10:00:00.000Z"
}
```

### Query audit logs

```bash
# Recent actions
curl -H "Authorization: Bearer $TOKEN" \
  "https://ops.example.com/api/audit?limit=50"

# Filter by user
curl -H "Authorization: Bearer $TOKEN" \
  "https://ops.example.com/api/audit?userId=user-uuid"

# Filter by action
curl -H "Authorization: Bearer $TOKEN" \
  "https://ops.example.com/api/audit?action=DEPLOY"
```

---

## 5. Session Management

### JWT token lifecycle

```
Login → access token (15 min TTL) + refresh token (7 days TTL)
     → refresh token stored as bcrypt hash in Session table

Access token expires → POST /api/auth/refresh
     → new access token + rotate refresh token
     → old session invalidated

Logout → POST /api/auth/logout
     → session deleted from DB
     → both tokens invalidated
```

### Active sessions

Each browser tab/device creates a separate session. Sessions are identified by:
- `userId`
- `refreshTokenHash`
- `ipAddress`
- `userAgent`
- `expiresAt`

### Force logout all sessions

```bash
# Logout current session
curl -X POST https://ops.example.com/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"

# Admin: delete all sessions for a user (via DB)
# DELETE FROM "Session" WHERE "userId" = 'user-uuid';
```

---

## 6. Secrets Encryption

### Registry passwords

Container registry passwords are encrypted at rest with AES-256-GCM:
```
cipher:  AES-256-GCM
key:     SECRETS_ENCRYPTION_KEY (32 bytes from env)
iv:      Random 16 bytes per encryption
storage: "iv_hex:ciphertext_hex:authtag_hex"
```

### SSH private keys

SSH private keys are encrypted the same way before database storage.

### Ansible Vault

Encrypt sensitive variables for Ansible playbooks:

```bash
# In Hamyar Ops UI: Secrets → Ansible Vault → Encrypt Variable
# Or CLI:
ansible-vault encrypt_string 'my-secret-value' --name 'db_password'
```

Output for use in playbooks:
```yaml
vars:
  db_password: !vault |
    $ANSIBLE_VAULT;1.1;AES256
    66386...
```

---

## 7. Production Security Checklist

### Before going live

```
Authentication
[ ] Change default admin password (admin123 → strong password)
[ ] Enable TOTP 2FA on all admin accounts
[ ] Set JWT_ACCESS_TTL=900 (15 min, not 3600)
[ ] Generate unique JWT_ACCESS_SECRET (min 32 chars)
[ ] Generate unique JWT_REFRESH_SECRET (different from access)

Encryption
[ ] Set SECRETS_ENCRYPTION_KEY to exactly 32 chars
[ ] chmod 600 /opt/hamyar/ops/api/.env
[ ] chown root:root /opt/hamyar/ops/api/.env

Database
[ ] Change PostgreSQL password from 'opspassword'
[ ] Change Redis password from 'opsredispassword'
[ ] Update DATABASE_URL with new DB password
[ ] Update REDIS_PASSWORD with new Redis password

Network
[ ] UFW enabled: ufw status
[ ] Only ports 22, 80, 443 open externally
[ ] DB port 5433 NOT exposed externally
[ ] Redis port 6380 NOT exposed externally

File Manager
[ ] FILE_BROWSER_ROOTS does not include /
[ ] FILE_BROWSER_ROOTS does not include /etc/passwd or /etc/shadow

SSL
[ ] HTTPS enabled with valid certificate
[ ] HTTP redirects to HTTPS (301)
[ ] SSL certificate auto-renews (certbot timer)

Nginx
[ ] Rate limiting configured
[ ] Server tokens hidden (server_tokens off)
[ ] Security headers (X-Frame-Options, HSTS, etc.)
```

### Recommended nginx security headers

Add to your nginx server block:
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
server_tokens off;
```

---

## 8. Incident Response

### Suspected unauthorized access

1. **Immediately:** Disable the compromised user account
   ```bash
   curl -X PATCH https://ops.example.com/api/users/:id \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"disabled": true}'
   ```

2. **Rotate JWT secrets** (invalidates ALL sessions for everyone):
   ```bash
   # On the server
   NEW_SECRET=$(openssl rand -hex 32)
   sed -i "s/JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$NEW_SECRET/" /opt/hamyar/ops/api/.env
   pm2 restart hamyar-ops-api
   ```

3. **Check audit logs** for what was accessed
4. **Rotate SSH keys** if server access is suspected (Ansible → rotate-keys playbook)
5. **Review active sessions** and delete suspicious ones

### Compromised SSH key

1. Run the `rotate-keys` Ansible playbook on all affected servers
2. Delete the old SSH key from Hamyar Ops key store
3. Update server references to use the new key
4. Check audit logs for commands executed with the old key

### Database exposure

1. Change PostgreSQL password immediately:
   ```bash
   docker exec hamyar-ops-postgres \
     psql -U opsuser -c "ALTER USER opsuser PASSWORD 'new-strong-password';"
   ```
2. Update `DATABASE_URL` in `.env`
3. Restart API: `pm2 restart hamyar-ops-api`
4. Rotate all secrets that may have been in the database (SSH keys, registry passwords)
