# Upgrade Guide

Instructions for upgrading Hamyar Ops between versions.

---

## General Upgrade Process

```bash
# 1. Check current version
curl -s https://ops.example.com/api/monitoring/health | grep version

# 2. Backup database first (always)
cd /opt/hamyar/ops
docker exec hamyar-ops-postgres pg_dump -U opsuser hamyar_ops | \
  gzip > /opt/hamyar/ops-backup-$(date +%Y%m%d).sql.gz

# 3. Pull latest code and deploy
# Via GitHub Actions: push to main branch
# Via local deploy: ./deploy/deploy.sh

# 4. Verify
curl -s https://ops.example.com/api/monitoring/health
pm2 status
```

---

## v1.1.0 → v1.2.0

**New features:** Terraform, Ansible, Deploy Pipelines, Container Registry, Secrets Manager, Observability module.

### Breaking changes

None.

### New migrations

The migration `20260711000001_add_iac_pipeline_registry` is applied automatically during deploy.

It creates 8 new tables:
- `TerraformWorkspace`, `TerraformRun`
- `AnsiblePlaybook`, `AnsibleJob`
- `Pipeline`, `PipelineRun`, `PipelineStep`
- `ContainerRegistry`

### New environment variables (optional)

```env
# Needed for secrets module (optional, can set via UI)
SECRETS_ENCRYPTION_KEY=<32 chars>

# Needed for Ansible Vault (optional)
ANSIBLE_VAULT_PASSWORD=<your-vault-password>

# Needed for HashiCorp Vault (optional)
VAULT_ADDR=http://vault.example.com:8200
VAULT_TOKEN=<vault-token>
```

### Post-upgrade steps

1. Install Ansible on ops server (required for Ansible module):
   ```bash
   apt-get install -y ansible
   ```

2. Install Terraform on ops server (required for Terraform module):
   ```bash
   wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
   echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
   apt-get update && apt-get install terraform
   ```

3. Create Terraform workspace directory:
   ```bash
   mkdir -p /opt/hamyar/tf
   ```

4. The 4 built-in Ansible playbooks (bootstrap, deploy-app, drift-check, rotate-keys) are seeded automatically on first API startup after upgrade.

---

## v1.0.0 → v1.1.0

**New features:** Multi-server management, SSH key store, incident tracking, backups, S3 storage, network firewall management, error log aggregator, centralized monitoring.

### New migrations

Applied automatically:
- `20260708000001_add_incident_monitoring_models`
- `20260709000001_add_backups_s3_network_terminal`
- `20260709100000_add_error_logs_and_alert_appname`
- `20260710000001_add_multi_server_ssh_keys`

### Post-upgrade steps

None required. All new features are opt-in.

---

## Rollback a Version

If an upgrade breaks something:

```bash
# 1. Restore database from backup
gunzip < /opt/hamyar/ops-backup-YYYYMMDD.sql.gz | \
  docker exec -i hamyar-ops-postgres psql -U opsuser hamyar_ops

# 2. Redeploy previous version
# Option A: git checkout previous tag and redeploy
cd /path/to/hamyar-ops
git checkout v1.1.0
./deploy/deploy.sh

# Option B: if GitHub Actions was used
# Go to Actions → choose last successful run → Re-run jobs
```
