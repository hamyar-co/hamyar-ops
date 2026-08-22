# Changelog — Hamyar Ops (`hamyar-ops`)

All notable infrastructure, Docker, and DevOps changes will be documented in this file with date, time, and version tags.

---

## [v2.1.0] - 2026-07-27 21:05 (+03:30)

### Added
- **Storage/Compute Separation**: Divided generic Worker Nodes into isolated `worker-compute` and `worker-storage` servers for performance stability.
- **Polyglot Build Engine**: Integrated **Nixpacks** into `ops-api` to auto-detect and build Rust, Node, and NestJS projects without requiring explicit Dockerfiles. Added `nixpacks-compose.yml`.
- **Advanced Security**: Mandated WebAuthn (Passkeys) and TOTP for `ops-ui` administrative access.

## [v2.0.0] - 2026-07-27 20:53 (+03:30)

### Changed
- **Major Architecture Rewrite**: Transitioned `hamyar-ops` from a generic panel to a specialized, Zero-Trust Master/Worker topology exclusively for Hamyar.
- **Directory Structure**: Renamed apps to `ops-ui` and `ops-api`, and created `infrastructure/` and `packages/shared/` to enforce strict organization.
- **Load Balancer**: Introduced Traefik in `infrastructure/master` for dynamic routing, replacing static Nginx configurations.
- **Security & Networking**: Implemented Zero Trust firewalling via `provision-worker.sh` closing all inbound worker ports except SSH and VPN. Designed isolated Docker bridge/overlay networks per application deployment.
- **Documentation**: Rewrote `README.md` to document the new architecture, topology, and backend/UI WebSocket integrations.

## [v1.1.0] - 2026-07-26 14:35 (+03:30)

### Added
- **Dark/Light Mode**: Full theme switcher with persistent local storage theme context and dark/light styling across all pages.
- **PostgreSQL / Redis / RabbitMQ Management**: Added full database, key-value, and queue management modules with status cards, query runners, key flush modals, and queue purging.
- **Servers & Load Balancer Re-architecture**: Consolidated Servers section with Load Balancer upstream pools, balancing algorithms (Round Robin, Least Conn, IP Hash), health checks, and SSH test tools.
- **Files & Nginx Redesign + Search**: Re-designed file browser and Nginx vhost management with instant search filters and code editing.
- **Multi-Step App Creation Wizard & DNS Generator**: 5-step application wizard auto-generating domains (`<app-name>.hamyar.io`) and DNS records (`A`, `CNAME`, `TXT`).
- **Microservices Logs & Web Terminal**: Live log streaming per service and interactive `xterm.js` Web Terminal shell container connection.
- **Docker UI & Performance Overhaul**: Real-time CPU/RAM progress gauges, paginated container listing, image/volume/network inspectors.
- **Firewall Suite**: UFW / iptables rule manager with inbound/outbound rules, port ranges, quick presets (Web 80/443, SSH 22, DBs), and master enable/disable toggle.
- **DevOps Tools Overhaul**: Improved Terraform, Ansible, Pipelines, Registry, GitHub, Cron Jobs (with Pre-created Presets), and Supervisor modules.
- **Pre-created Cron Presets**: Visual cron builder with 10+ ready presets eliminating manual cron typing.
- **Centralized Event Logging**: Intercepting and logging all user actions (env edit, nginx config edit, app deploys/downtimes, firewall edits, logins) into the `Events` dashboard.
- **Custom UI Component System**: Custom design system controls (`CustomSelect`, `CustomInput`, `CustomSwitch`, `CustomBadge`, `CustomModal`, `CustomButton`, `CustomTabs`).
- **Settings Feature Toggle**: Menu & feature customizer under Settings allowing users to show/hide sidebar sections for a minimal panel layout.

### Fixed
- **Ops Log Drawer Fix**: Fixed WebSocket `event:new` broadcast bug in `EventsGateway` and added initial event history fetching on drawer mount.

---

## [v1.0.0] - 2026-07-26 09:30 (+03:30)

### Added
- **Docker Compose Orchestration**: Configured `docker-compose.yml`, `docker-compose.local.yml`, and `docker-compose.prod.yml` for microservices, PostgreSQL, Redis, and RabbitMQ.
- **Nginx Reverse Proxy & SSL**: Configured Nginx proxy rules for API Gateway and Admin API with SSL certificate renewal support.
- **Observability Pipeline**: Integrated Filebeat log aggregation (`filebeat.yml`) and health monitoring scripts.
- **Deployment Automation**: Added shell automation scripts (`setup-docker.sh`, `build-all-services.sh`, `deploy.sh`, `generate-jwt-keys.sh`).
