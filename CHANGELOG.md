# Changelog — Hamyar Ops (`hamyar-ops`)

All notable infrastructure, Docker, and DevOps changes will be documented in this file with date, time, and version tags.

---

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
