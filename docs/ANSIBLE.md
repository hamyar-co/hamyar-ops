# Ansible Guide

Automate server configuration, application deployment, drift detection, and SSH key rotation across your entire fleet.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Requirements](#2-requirements)
3. [Built-in Playbooks](#3-built-in-playbooks)
4. [Create a Custom Playbook](#4-create-a-custom-playbook)
5. [Run a Playbook](#5-run-a-playbook)
6. [Live Execution Logs](#6-live-execution-logs)
7. [Drift Detection](#7-drift-detection)
8. [SSH Key Rotation](#8-ssh-key-rotation)
9. [Variables and Secrets](#9-variables-and-secrets)
10. [Inventory Management](#10-inventory-management)
11. [API Reference](#11-api-reference)

---

## 1. Overview

Hamyar Ops runs Ansible playbooks **from the ops server** against your managed servers. It automatically builds the inventory from your registered servers and SSH keys — no manual `hosts` file needed.

```
Browser (Ansible UI)
  → POST /api/ansible/playbooks/:id/run {serverIds}
  → AnsibleJob created (PENDING)
  → BullMQ queue: ansible
  → [async] AnsibleProcessor.process()
  → AnsibleService.executeJob()
      → Write /tmp/inventory.ini from ManagedServer records
      → Write /tmp/playbook.yml from AnsiblePlaybook.content
      → spawn: ansible-playbook -i inv.ini pb.yml
      → Stream stdout/stderr line-by-line
      → Emit ansible:log WebSocket events
  → AnsibleJob updated (SUCCESS/FAILED)
  → ansible:done WebSocket event
  → Browser: show result
```

---

## 2. Requirements

Ansible must be installed on the **ops server** (the machine running hamyar-ops-api):

```bash
# Ubuntu / Debian
apt-get install -y ansible

# Verify
ansible --version
# ansible [core 2.15+]
```

Target servers need:
- SSH access from the ops server
- Python 3 installed (`apt-get install python3`)

---

## 3. Built-in Playbooks

Four playbooks are seeded automatically on first startup. They cannot be deleted (marked `builtIn: true`).

### `bootstrap` — Full server setup

Installs everything needed to run applications:

```yaml
Tasks:
  - Update apt cache
  - Install: curl, git, nginx, ufw, build-essential
  - Install Node.js 22 (NodeSource)
  - Install PM2 globally
  - Install Docker Engine
  - Configure UFW: enable, allow 22/80/443
  - Enable and start Nginx
```

**Run time:** ~3–5 minutes on a fresh server.

### `drift-check` — Configuration validation

Checks that expected tools are installed and at the right version:

```yaml
Checks:
  - nodejs: must be v22.x
  - pm2: must be installed
  - docker: must be installed
  - nginx: must be installed

Output format (parsed by Hamyar Ops):
  DRIFT:nodejs|>=22|v22.4.0|false      ← no drift
  DRIFT:docker|installed|NOT_INSTALLED|true  ← drift detected!
```

### `deploy-app` — Git pull and restart

Deploy an application update from a git repository:

```yaml
Variables required:
  app_name:    PM2 process name   (e.g. "my-app")
  deploy_path: app directory      (e.g. "/opt/my-app")
  branch:      git branch         (default: "main")

Tasks:
  - git pull latest from origin/branch
  - npm install --production
  - pm2 reload <app_name> --update-env
```

### `rotate-keys` — SSH key rotation

Safely rotate SSH keys across servers:

```yaml
Variables required:
  new_public_key: SSH public key content to add
  remove_old_key: (optional) SSH public key to remove

Tasks:
  - Add new_public_key to authorized_keys
  - Remove remove_old_key from authorized_keys (if provided)
```

---

## 4. Create a Custom Playbook

### Via dashboard

1. Go to **Ansible → Playbooks** tab
2. Click **New Playbook**
3. Fill in:
   - **Name** — unique identifier
   - **Description** — what this playbook does
   - **Target Tags** — (optional) default server tags to target
   - **Content** — full YAML playbook

4. Click **Save**

### Example: Install and configure Redis

```yaml
---
- name: Install Redis
  hosts: all
  become: yes
  vars:
    redis_port: "{{ redis_port | default('6379') }}"
    redis_password: "{{ redis_password | default('') }}"
  tasks:
    - name: Install Redis
      apt:
        name: redis-server
        state: present
        update_cache: yes

    - name: Configure Redis port
      lineinfile:
        path: /etc/redis/redis.conf
        regexp: '^port '
        line: "port {{ redis_port }}"

    - name: Configure Redis password
      lineinfile:
        path: /etc/redis/redis.conf
        regexp: '^# requirepass'
        line: "requirepass {{ redis_password }}"
      when: redis_password != ''

    - name: Restart Redis
      service:
        name: redis-server
        state: restarted
        enabled: yes
```

### Example: Deploy a Node.js app with PM2

```yaml
---
- name: Deploy Node.js application
  hosts: all
  become: no
  vars:
    app_name: "{{ app_name }}"
    deploy_path: "{{ deploy_path | default('/opt/' + app_name) }}"
    repo_url: "{{ repo_url }}"
    branch: "{{ branch | default('main') }}"
    node_env: "{{ node_env | default('production') }}"
  tasks:
    - name: Clone or update repository
      git:
        repo: "{{ repo_url }}"
        dest: "{{ deploy_path }}"
        version: "{{ branch }}"
        force: yes

    - name: Install dependencies
      command: npm install --production
      args:
        chdir: "{{ deploy_path }}"
      environment:
        NODE_ENV: "{{ node_env }}"

    - name: Run build (if package.json has build script)
      command: npm run build --if-present
      args:
        chdir: "{{ deploy_path }}"
      environment:
        NODE_ENV: "{{ node_env }}"

    - name: Start or reload with PM2
      shell: |
        if pm2 show {{ app_name }} > /dev/null 2>&1; then
          pm2 reload {{ app_name }} --update-env
        else
          pm2 start npm --name {{ app_name }} -- start
          pm2 save
        fi
      args:
        executable: /bin/bash
```

---

## 5. Run a Playbook

### Via dashboard

1. Go to **Ansible → Playbooks**
2. Click **Run** on any playbook
3. In the modal:
   - **Select Servers** — pick one or more from your fleet
   - **Variables (JSON)** — optional key-value overrides
4. Click **Execute**

The job appears immediately in the **Jobs** tab with PENDING status.

### Variables example

```json
{
  "app_name": "my-api",
  "deploy_path": "/opt/my-api",
  "branch": "release/v2.0",
  "node_env": "production"
}
```

### Via API

```bash
# Run a playbook
curl -X POST https://ops.example.com/api/ansible/playbooks/:playbookId/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serverIds": ["clx...", "cly..."],
    "variables": {
      "app_name": "my-app",
      "branch": "main"
    }
  }'

# Response:
{
  "id": "clz...",
  "status": "PENDING",
  "playbookId": "...",
  "serverIds": ["clx...", "cly..."],
  "startedAt": "2026-07-11T10:00:00.000Z"
}
```

---

## 6. Live Execution Logs

As the playbook runs, logs stream in real-time via WebSocket.

### In the dashboard

Go to **Ansible → Jobs** → click any running job to expand the log panel.

```
PLAY [Bootstrap server] ****
ok: [prod-web-1]

TASK [Update apt cache] ****
changed: [prod-web-1]

TASK [Install Node.js 22] ****
changed: [prod-web-1]

PLAY RECAP ****
prod-web-1: ok=10 changed=5 unreachable=0 failed=0
```

### Subscribe via WebSocket

```js
socket.emit('subscribe', { topics: ['ansible:job-id-here'] })
socket.on('ansible:log', ({ jobId, line, stream }) => {
  console.log(`[${stream}] ${line}`)
})
socket.on('ansible:done', ({ jobId, status, driftReport }) => {
  console.log(`Job ${jobId} finished: ${status}`)
})
```

---

## 7. Drift Detection

### Run a drift check

```
Ansible → Drift tab → [Server] → Check Drift
```

Or via API:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://ops.example.com/api/ansible/drift/:serverId
```

### Reading results

```json
{
  "serverId": "clx...",
  "serverName": "prod-web-1",
  "checkedAt": "2026-07-11T10:00:00.000Z",
  "hasDrift": true,
  "checks": [
    { "name": "nodejs", "expected": ">=22", "actual": "v22.4.0", "drift": false },
    { "name": "pm2",    "expected": "installed", "actual": "5.4.3",  "drift": false },
    { "name": "docker", "expected": "installed", "actual": "NOT_INSTALLED", "drift": true },
    { "name": "nginx",  "expected": "installed", "actual": "nginx/1.24.0", "drift": false }
  ]
}
```

### Auto-fix drift

When drift is found, click **Fix → Run Bootstrap** to remediate automatically.

---

## 8. SSH Key Rotation

### Safe rotation process

```
Step 1: Generate new key pair (on ops server or locally)
Step 2: Add new public key via rotate-keys playbook (adds it, does NOT remove old)
Step 3: Verify you can connect with the new key
Step 4: Run rotate-keys again with remove_old_key to remove the old one
Step 5: Update SSH key reference in Hamyar Ops Server config
```

### Run via dashboard

1. **Ansible → Playbooks → rotate-keys → Run**
2. Variables:
```json
{
  "new_public_key": "ssh-ed25519 AAAA... hamyar-ops-new",
  "remove_old_key": "ssh-rsa AAAA... old-key"
}
```

---

## 9. Variables and Secrets

### Pass variables at run time

Variables in the Run modal are passed as `--extra-vars` to `ansible-playbook`. They override playbook defaults.

### Use Ansible Vault for secrets

For sensitive variables (passwords, API keys):

1. Go to **Secrets → Ansible Vault** tab
2. **Set Vault Password** → enter a master password
3. **Encrypt Variable**:
   - Key: `db_password`
   - Value: `super-secret-123`
   - Password: your vault password
4. Copy the encrypted output:
   ```
   db_password: !vault |
     $ANSIBLE_VAULT;1.1;AES256
     66386...
   ```
5. Paste into your playbook's `vars:` section

### Decrypt a variable

1. **Secrets → Ansible Vault → Decrypt Variable**
2. Paste the `!vault |` block
3. Enter vault password
4. See the decrypted value

---

## 10. Inventory Management

Hamyar Ops auto-generates the Ansible inventory from your registered servers.

### Generated inventory format

```ini
[all]
prod-web-1 ansible_host=91.220.113.171 ansible_port=22 ansible_user=root \
  ansible_ssh_private_key_file=/tmp/ansible-key-abc123 \
  ansible_ssh_common_args='-o StrictHostKeyChecking=no'

prod-db-1 ansible_host=91.220.113.172 ansible_port=22 ansible_user=root \
  ansible_ssh_private_key_file=/tmp/ansible-key-def456 \
  ansible_ssh_common_args='-o StrictHostKeyChecking=no'
```

SSH key files are written to `/tmp/` with `chmod 600` and deleted after the job completes.

### Target specific servers by tag

When running a playbook from the UI, select servers individually. To target by tag programmatically:

```bash
# Get all server IDs tagged 'production'
curl -H "Authorization: Bearer $TOKEN" \
  "https://ops.example.com/api/servers?tag=production" | jq '.[].id'
```

---

## 11. API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/ansible/playbooks` | Any | List all playbooks |
| POST | `/api/ansible/playbooks` | ADMIN | Create playbook |
| GET | `/api/ansible/playbooks/:id` | Any | Get playbook |
| PUT | `/api/ansible/playbooks/:id` | ADMIN | Update playbook |
| DELETE | `/api/ansible/playbooks/:id` | ADMIN | Delete playbook (not builtIn) |
| POST | `/api/ansible/playbooks/:id/run` | ADMIN | Run playbook |
| GET | `/api/ansible/jobs` | Any | List jobs |
| GET | `/api/ansible/jobs/:id` | Any | Get job with output |
| GET | `/api/ansible/drift/:serverId` | Any | Run drift check |
