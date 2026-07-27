# Hamyar Infrastructure & DevOps (`hamyar-ops`)

> **Production Repository**: [https://github.com/hamyar-co/hamyar-ops](https://github.com/hamyar-co/hamyar-ops)  
> **Version**: `1.0.0`

Infrastructure, Docker orchestration, reverse proxy configurations, log collection pipelines, and CI/CD automation scripts for the Hamyar platform.

---

## ⚙️ Components

- **Docker Compose Setup**:
  - `docker-compose.yml`: Main production stack.
  - `docker-compose.local.yml`: Hot-reloading development stack.
  - `docker-compose.prod.yml`: Hardened production deployment.
- **Nginx Reverse Proxy (`nginx/`)**: SSL termination (Certbot / LetsEncrypt), route proxies to gateway and admin-api.
- **Observability (`filebeat.yml`, `observability/`)**: Filebeat log collection and ELK stack integration.
- **Scripts (`scripts/`)**: Automated setup, build, deployment, and JWT RSA key generation.

---

## 🚀 Execution Commands

```bash
# Setup local docker environment
./scripts/setup-docker.sh

# Build all container images
./scripts/build-all-services.sh

# Deploy to production server
./scripts/deploy.sh
```

---

## 📝 Documenting Changes
Update `CHANGELOG.md` whenever infrastructure configurations, ports, or deployment pipelines are modified.
