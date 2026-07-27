# Server Setup Guide

Bootstrap a fresh VPS from scratch to a fully configured server using Hamyar Ops.

---

## Quick Method: Ansible Bootstrap (Recommended)

After adding a server to Hamyar Ops, run the built-in `bootstrap` playbook to configure it in one click.

### Requirements

- The new VPS is accessible via SSH (key or password)
- Ansible installed on the ops server (`apt-get install ansible`)
- The server is added to Hamyar Ops (**Servers → Add Server**)

### Run bootstrap

1. Go to **Ansible → Playbooks**
2. Click **Run** on `bootstrap`
3. Select your new server
4. Click **Execute**
5. Watch the log — takes ~3–5 minutes

When complete, the server has: Node.js 22, PM2, Docker, Nginx, UFW.

---

## Manual Setup (Step by Step)

If you prefer to bootstrap manually via SSH before adding to Hamyar Ops:

### 1. Connect

```bash
ssh root@your-new-server-ip
```

### 2. Update system

```bash
apt-get update && apt-get upgrade -y
apt-get install -y curl git rsync build-essential ufw
```

### 3. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v  # Should show v22.x.x
```

### 4. Install PM2

```bash
npm install -g pm2
pm2 startup systemd -u root --hp /root
```

### 5. Install Docker

```bash
curl -fsSL https://get.docker.com | bash
systemctl enable docker --now
docker --version
```

### 6. Install Nginx

```bash
apt-get install -y nginx
systemctl enable nginx --now
```

### 7. Configure UFW

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose
```

### 8. Create directories

```bash
mkdir -p /opt/myapp /var/log/myapp /var/backups/myapp
```

### 9. Generate SSH key (for Hamyar Ops fleet access)

```bash
ssh-keygen -t ed25519 -C "hamyar-fleet" -f /root/.ssh/id_rsa -N ""
cat /root/.ssh/id_rsa.pub >> /root/.ssh/authorized_keys
cat /root/.ssh/id_rsa   # Copy this private key into Hamyar Ops SSH Key Store
```

### 10. Add to Hamyar Ops

1. Copy the private key output from step 9
2. Go to **Servers → SSH Keys → Add SSH Key**
3. Paste the private key
4. Go to **Servers → Add Server**
5. Enter the IP, port 22, username root
6. Select the SSH key

---

## Post-Setup: Deploy Your First App

### Option A: Via Deploy Pipeline

1. Go to **Pipelines → New Pipeline**
2. Set:
   - App Name: `my-app`
   - Server: your new server
   - Strategy: `restart`
   - Build Mode: `remote`
3. Click **Trigger** to deploy

### Option B: Via Ansible deploy-app playbook

1. Go to **Ansible → Playbooks → deploy-app → Run**
2. Variables:
   ```json
   {
     "app_name": "my-app",
     "deploy_path": "/opt/my-app",
     "repo_url": "https://github.com/you/my-app.git",
     "branch": "main"
   }
   ```
3. Select your server → Execute

### Option C: SSH deploy script

If your app has a deploy.sh:
```bash
# From your local machine:
rsync -avz --exclude node_modules ./my-app/ root@your-server:/opt/my-app/
ssh root@your-server 'cd /opt/my-app && npm install && pm2 reload my-app || pm2 start npm --name my-app -- start && pm2 save'
```

---

## Setup Nginx for Your App

After deploying the app, configure Nginx:

### Via Nginx page in Hamyar Ops

1. Go to **Nginx → Edit Site**
2. Create a new config for your domain

### Manual config

```nginx
server {
    listen 80;
    server_name myapp.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;  # ← your app port
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
nginx -t && nginx -s reload
```

### SSL with Let's Encrypt

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d myapp.example.com -m you@example.com --agree-tos --non-interactive
```

Auto-renewal is configured by Certbot automatically.

---

## Verify Everything Works

```bash
# PM2 processes
pm2 status

# Test app
curl -s http://localhost:3000/health

# Test via domain
curl -s https://myapp.example.com/health

# Nginx
nginx -t
systemctl status nginx

# Firewall
ufw status verbose

# Docker (if using containers)
docker ps
```
