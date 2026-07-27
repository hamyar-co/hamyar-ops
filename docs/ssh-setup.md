# SSH Key Setup Guide

This guide covers two separate SSH key setups:
1. **Terminal feature** — lets the ops dashboard SSH into the server from within the API
2. **GitHub Actions** — lets CI/CD deploy automatically on push to `main`

---

## Part 1 — Terminal Feature (API → Server SSH)

The ops terminal works by having the API (running on the server) SSH to itself via `127.0.0.1`. This needs a dedicated key pair on the server.

### Step 1: Generate the key on the server

```bash
ssh root@91.220.113.171
```

Once connected:

```bash
# Generate a dedicated key pair (no passphrase so the API can use it headlessly)
ssh-keygen -t ed25519 -f /root/.ssh/hamyar_ops -N "" -C "hamyar-ops-terminal"

# Add the public key to authorized_keys
cat /root/.ssh/hamyar_ops.pub >> /root/.ssh/authorized_keys

# Lock down permissions
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chmod 600 /root/.ssh/hamyar_ops
```

### Step 2: Update the API .env on the server

```bash
ENV=/opt/hamyar/ops/api/.env

# Remove any old SSH vars first
grep -v "^SSH_HOST=\|^SSH_KEY_PATH=\|^SSH_PORT=\|^SSH_USERNAME=" "$ENV" > /tmp/e && mv /tmp/e "$ENV"

# Append new values
cat >> "$ENV" <<'EOF'
SSH_HOST=127.0.0.1
SSH_USERNAME=root
SSH_PORT=22
SSH_KEY_PATH=/root/.ssh/hamyar_ops
EOF
```

### Step 3: Restart the API

```bash
pm2 restart hamyar-ops-api
```

### Step 4: Test it

Open the Ops dashboard terminal at `https://ops.hamyar.app/terminal` — it should connect immediately.

### Verify manually (optional)

```bash
# Test the key works for self-SSH
ssh -i /root/.ssh/hamyar_ops -o StrictHostKeyChecking=no root@127.0.0.1 "echo OK"
```

---

## Part 2 — GitHub Actions Deploy Key

This lets GitHub Actions build and deploy on every push to `main` without a password.

### Step 1: Generate the deploy key (run on your local machine)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/hamyar_deploy -N "" -C "github-actions@hamyar-ops"
```

This creates two files:
- `~/.ssh/hamyar_deploy` — **private key** (goes into GitHub secret)
- `~/.ssh/hamyar_deploy.pub` — **public key** (goes onto the server)

### Step 2: Add the public key to the server

```bash
# Option A — using ssh-copy-id (easiest)
ssh-copy-id -i ~/.ssh/hamyar_deploy.pub root@91.220.113.171

# Option B — manual
cat ~/.ssh/hamyar_deploy.pub | ssh root@91.220.113.171 \
  "cat >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys"
```

### Step 3: Add the private key as a GitHub secret

1. Copy the private key:
   ```bash
   cat ~/.ssh/hamyar_deploy
   ```
2. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `DEPLOY_SSH_KEY`
5. Value: paste the entire private key (including `-----BEGIN...` and `-----END...` lines)
6. Click **Add secret**

### Step 4: Test the workflow

Push any change to `main` or go to **Actions** → **Deploy Hamyar Ops** → **Run workflow**.

### Verify the key works from your machine (optional)

```bash
ssh -i ~/.ssh/hamyar_deploy root@91.220.113.171 "echo Deploy key works"
```

---

## Troubleshooting

### "All configured authentication methods failed"
- The API `.env` is missing `SSH_KEY_PATH` or the key file doesn't exist at that path
- Run Step 1 and Step 2 from Part 1 again

### "Permission denied (publickey)"
- The public key wasn't added to `authorized_keys`
- Check: `cat /root/.ssh/authorized_keys` — verify the key is there

### GitHub Actions: "Host key verification failed"
- The workflow already includes `ssh-keyscan` — check that step ran successfully
- Verify `DEPLOY_SSH_KEY` secret contains the full private key (no trailing space or missing newlines)

### pnpm version conflict error
- The workflow uses `pnpm/action-setup@v4` **without** specifying a `version` — it reads `packageManager` from `package.json` automatically
- Do **not** add `version:` to the pnpm setup step in the workflow

### Node version deprecation warning
- The workflow uses `node-version: '22'` — this matches the server environment
- Do not pin to Node 20 (deprecated in GitHub-hosted runners as of Sep 2025)

---

## Key file locations summary

| Key | Location | Purpose |
|---|---|---|
| `/root/.ssh/hamyar_ops` | Server | API → self SSH (terminal feature) |
| `/root/.ssh/hamyar_ops.pub` | Server (authorized_keys) | Allows above |
| `~/.ssh/hamyar_deploy` | Local machine | GitHub Actions → server |
| `~/.ssh/hamyar_deploy.pub` | Server (authorized_keys) | Allows above |
| GitHub secret `DEPLOY_SSH_KEY` | GitHub repo settings | CI/CD private key |
