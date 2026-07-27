# Local Deploy Guide — Hamyar Ops

Deploy Hamyar Ops (`hamyar-ops-api` + `hamyar-ops-ui`) to the production server
directly from your laptop. No GitHub Actions required — a ready-to-run script is
included.

- **Server:** `root@91.220.113.171` → `https://ops.hamyar.app`
- **API dir on server:** `/opt/hamyar/ops/api`
- **Web dir on server:** `/opt/hamyar/ops/web`
- **PM2 processes:** `hamyar-ops-api` (port 3005) · `hamyar-ops-ui` (port 3004)

---

## 1. Prerequisites (one-time)

1. **SSH key access** to the server as `root@91.220.113.171`. Verify:

   ```bash
   ssh root@91.220.113.171 'echo ok'
   ```

   If you key isn't installed yet, copy it: `ssh-copy-id root@91.220.113.171`.

2. **Local toolchain** (Node ≥ 20, pnpm ≥ 9, rsync, ssh):

   ```bash
   node -v && pnpm -v && rsync --version | head -1 && ssh -V
   ```

3. **Install workspace deps** (in repo root):

   ```bash
   cd hamyar-ops
   pnpm install
   ```

4. **First-time server bootstrap** (creates dirs, starts postgres + redis
   containers, installs nginx config, issues SSL cert). This is idempotent and
   safe to re-run:

   ```bash
   ./deploy/setup-server.sh
   ```
   Then on the server edit `/opt/hamyar/ops/api/.env` and set strong values for
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL=3600`, and
   `DEPLOY_RECORD_TOKEN`. (This is already done on the current server.)

---

## 2. Deploy from local

From the repo root (`hamyar-ops`), run:

```bash
./deploy/deploy.sh
```

That single command does everything:

1. Builds `@hamyar-ops/shared` → `@hamyar-ops/api` → `@hamyar-ops/web`
   (Web is built with `output: 'standalone'` and `NEXT_PUBLIC_WS_URL=https://ops.hamyar.app`).
2. Patches the Next.js standalone client-reference manifests.
3. Bundles the API with `pnpm deploy --prod`, copies in `dist/` + `prisma/`.
4. `rsync --delete`-syncs the API bundle to `/opt/hamyar/ops/api`
   (`.env` is **excluded** — your server secrets are never overwritten).
5. `rsync`s the Web standalone tree + `.next/static` + `public/` to
   `/opt/hamyar/ops/web`.
6. Syncs `deploy/ecosystem.ops.config.js` to `/opt/hamyar/ops/`.
7. **On the server:** removes Mac `.node` binaries, `pnpm rebuild`,
   `prisma generate`, **`prisma migrate deploy`** (applies any new migrations),
   runs `prisma/seed.js`, then `pm2 restart hamyar-ops-api hamyar-ops-ui` (or
   `pm2 start` if they aren't running yet), and `pm2 save`.

Expected last line: `==> Done. Check: https://ops.hamyar.app`

---

## 3. Verify the deploy

```bash
# API health (public)
curl -s https://ops.hamyar.app/api/monitoring/health

# UI
open https://ops.hamyar.app
```

On the server:

```bash
ssh root@91.220.113.171 'pm2 status && curl -s http://localhost:3005/api/monitoring/health'
```

Logs: `ssh root@91.220.113.171 'pm2 logs hamyar-ops-api --lines 50 --nostream'`

---

## 4. Common operations

| Task | Command |
|------|---------|
| Deploy both | `./deploy/deploy.sh` |
| Tail API logs | `ssh root@91.220.113.171 'pm2 logs hamyar-ops-api --lines 100'` |
| Tail UI logs | `ssh root@91.220.113.171 'pm2 logs hamyar-ops-ui --lines 100'` |
| Restart API only | `ssh root@91.220.113.171 'pm2 restart hamyar-ops-api'` |
| Restart UI only | `ssh root@91.220.113.171 'pm2 restart hamyar-ops-ui'` |
| Run a pending DB migration | `ssh root@91.220.113.171 'cd /opt/hamyar/ops/api && node_modules/.bin/prisma migrate deploy'` |
| Prisma Studio | `ssh root@91.220.113.171 'cd /opt/hamyar/ops/api && node_modules/.bin/prisma studio'` |
| Check migration history | `ssh root@91.220.113.171 'ls /opt/hamyar/ops/api/prisma/migrations'` |

---

## 5. Notes & gotchas

- **`.env` is never rsync'd.** Edit `/opt/hamyar/ops/api/.env` directly on the
  server. The deploy only syncs code + `prisma/` + the PM2 ecosystem file.
- **`apps/web/.env.local`** (`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`) is a
  **local dev** file only — `deploy.sh` overrides both with prod values at
  build time (`NEXT_PUBLIC_API_URL=""` so the UI talks to `/api` via nginx,
  `NEXT_PUBLIC_WS_URL=https://ops.hamyar.app` for Socket.IO). Do not commit
  prod URLs to `.env.local`.
- **Mac → Linux native binaries:** `deploy.sh` deletes any `.node` files before
  rebuild so the macOS Prisma/ssh2 engines are replaced with Linux ones.
- **`prisma migrate deploy`** (not `dev`) is used in prod → it only applies
  committed migrations and never resets data. When you add a new migration
  locally with `pnpm --filter @hamyar-ops/api db:migrate`, commit the
  `migration.sql` and `deploy.sh` will apply it on the next deploy.
- **`DEPLOY_RECORD_TOKEN`** — only needed if you also want GitHub Actions to
  record deploys into the Ops UI. Local deploys via `deploy.sh` don't record a
  version automatically (you can do it via the in-app deploy trigger if wanted).

---

## 6. CI (optional)

The same pipeline runs automatically on push to `main` via
`.github/workflows/deploy.yml`. If you prefer local deploys, just ignore CI —
or disable the workflow to avoid race conditions with `deploy.sh`:

```bash
gh workflow disable 'Deploy Hamyar Ops'
```