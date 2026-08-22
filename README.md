# Hamyar Server Management Platform (`hamyar-ops`)

> **Production Repository**: [https://github.com/hamyar-co/hamyar-ops](https://github.com/hamyar-co/hamyar-ops)  
> **Version**: `2.0.0` (Zero-Trust Master/Worker Architecture)

The dedicated server management and deployment platform for the Hamyar ecosystem. This system is designed exclusively around high-security (Zero Trust), isolated private networking, and microservice lifecycle management.

---

## 🏗 Architecture

### 1. Master/Worker Topology
- **Master Node**: The central control plane running the `ops-ui` (Next.js dashboard) and `ops-api` (NestJS backend). It is the only node exposed to the public internet via a Global Load Balancer (Traefik).
- **Compute Worker Nodes**: Dedicated servers for running Hamyar's applications and microservices via Polyglot auto-builds.
- **Storage Worker Nodes**: Dedicated database and object storage (MinIO) nodes isolated from application workloads to guarantee database performance.
- **Networking Policy**: All worker nodes have no public open ports except SSH (for management) and a self-hosted secure VPN (WireGuard) managed by the platform.

### 2. Zero Trust & Networking
- **Private Network**: Every application deployment on a worker node receives its own isolated Docker Bridge network. 
- **Internal Routing**: Traefik on the Master Node securely proxies web requests to the Worker Nodes via mTLS and internal IP routing over the VPN.

---

## ⚙️ Directory Structure

- `apps/ops-ui/`: Frontend Next.js dashboard supporting WebAuthn (Passkeys) and TOTP.
- `apps/ops-api/`: Backend NestJS orchestrator featuring **Nixpacks** integration for containerizing polyglot apps.
- `infrastructure/master/`: Traefik dynamic routing and Master Node configuration.
- `infrastructure/worker-compute/`: Configuration and network isolation for Compute Nodes.
- `infrastructure/worker-storage/`: Templates and configurations for dedicated Storage Nodes.
- `infrastructure/templates/`: Docker Compose blueprints including `nixpacks-compose.yml`.
- `packages/shared/`: Shared validation schemas and DTOs between UI and API.
- `scripts/`: Provisioning shell scripts (`provision-compute-worker.sh`, etc.).

---

## 🔌 UI & Backend Integration

The communication and access matrix between the dashboard (`ops-ui`) and the orchestrator (`ops-api`) is strictly controlled:
1. **Zero-Trust Auth**: Access to `ops-ui` requires mandatory 2FA (TOTP) or WebAuthn (Passkeys) in addition to JWT.
2. **REST API**: Managed via Axios using strict Role-Based Access Control (RBAC).
2. **WebSockets (Real-time)**: Socket.io handles live streaming of container logs, deployment progress bars, and the interactive Web Terminal.
3. **Internal Orchestration**: The `ops-api` connects to Worker Nodes strictly via SSH and Docker's mTLS socket (Port 2376).

---

## 🚀 Execution Commands

```bash
# Provision a new Worker Node (run on master or via automation)
./scripts/provision-worker.sh <MASTER_IP> <WORKER_IP>

# Start the Master Control Plane
cd infrastructure/master && docker-compose up -d
```

## 📝 Documenting Changes
Update `CHANGELOG.md` whenever infrastructure configurations, ports, or deployment pipelines are modified.
