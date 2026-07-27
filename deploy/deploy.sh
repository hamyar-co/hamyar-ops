#!/usr/bin/env bash
# Hamyar Ops deployment script
# Usage: ./deploy/deploy.sh

set -euo pipefail

SERVER="root@91.220.113.171"
REMOTE_API_DIR="/opt/hamyar/ops/api"
REMOTE_WEB_DIR="/opt/hamyar/ops/web"
REMOTE_ROOT="/opt/hamyar/ops"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$LOCAL_ROOT/apps/web"

echo "==> Building shared package..."
cd "$LOCAL_ROOT"
pnpm --filter @hamyar-ops/shared build

echo "==> Building API..."
cd "$LOCAL_ROOT"
pnpm --filter @hamyar-ops/api build

echo "==> Building Web..."
cd "$LOCAL_ROOT"
# NEXT_PUBLIC_* vars are baked at build time — override .env.local with prod values.
# API_URL is empty so api.ts falls back to relative /api (nginx proxies it).
# WS_URL points to the production domain for Socket.IO.
NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL="https://ops.hamyar.app" \
  pnpm --filter @hamyar-ops/web build

# Patch: Next.js 15 standalone build skips *_client-reference-manifest.js for
# route group pages — copy any missing ones from the full build into standalone.
echo "==> Patching standalone (client-reference manifests)..."
STANDALONE_SERVER="$WEB_DIR/.next/standalone/apps/web/.next/server"
FULL_SERVER="$WEB_DIR/.next/server"
find "$FULL_SERVER" -name "*_client-reference-manifest.js" | while read -r src; do
  rel="${src#"$FULL_SERVER/"}"
  dest="$STANDALONE_SERVER/$rel"
  if [ ! -f "$dest" ]; then
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
  fi
done

# --- API ---
echo "==> Bundling API with pnpm deploy (flattens workspace deps)..."
rm -rf "$LOCAL_ROOT/deploy/.api-bundle"
pnpm --filter @hamyar-ops/api deploy --prod "$LOCAL_ROOT/deploy/.api-bundle"
cp -r "$LOCAL_ROOT/apps/api/dist"   "$LOCAL_ROOT/deploy/.api-bundle/dist"
cp -r "$LOCAL_ROOT/apps/api/prisma" "$LOCAL_ROOT/deploy/.api-bundle/prisma"

echo "==> Syncing API bundle to server..."
rsync -az --delete \
  --exclude .git --exclude .env \
  "$LOCAL_ROOT/deploy/.api-bundle/" "$SERVER:$REMOTE_API_DIR/"

rm -rf "$LOCAL_ROOT/deploy/.api-bundle"

# --- Web (Next.js standalone) ---
# next build with output:'standalone' produces a self-contained node app.
# Structure synced to server:
#   $REMOTE_WEB_DIR/                   (standalone root, contains node_modules/)
#   $REMOTE_WEB_DIR/apps/web/server.js (PM2 entry point)
#   $REMOTE_WEB_DIR/apps/web/.next/    (server chunks)
#   $REMOTE_WEB_DIR/apps/web/.next/static/  (patched in separately)
echo "==> Syncing Web standalone to server..."
rsync -az --delete \
  --exclude .git \
  "$WEB_DIR/.next/standalone/" "$SERVER:$REMOTE_WEB_DIR/"

# static/ must live at apps/web/.next/static inside the standalone tree
rsync -az --delete \
  "$WEB_DIR/.next/static/" \
  "$SERVER:$REMOTE_WEB_DIR/apps/web/.next/static/"

# public/ (optional)
if [ -d "$WEB_DIR/public" ]; then
  rsync -az --delete \
    "$WEB_DIR/public/" \
    "$SERVER:$REMOTE_WEB_DIR/apps/web/public/"
fi

# --- PM2 ecosystem config ---
echo "==> Syncing PM2 ecosystem config..."
rsync -az \
  "$LOCAL_ROOT/deploy/ecosystem.ops.config.js" \
  "$SERVER:$REMOTE_ROOT/ecosystem.ops.config.js"

# --- Remote: migrate + restart ---
echo "==> Running migrations and restarting..."
ssh "$SERVER" bash <<'REMOTE'
  set -e

  cd /opt/hamyar/ops/api

  if [ ! -f .env ]; then
    echo "ERROR: /opt/hamyar/ops/api/.env not found."
    echo "Run ./deploy/setup-server.sh first, then edit the JWT secrets."
    exit 1
  fi

  DB_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')"

  # Remove any macOS .node binaries that were rsync'd from the Mac build machine,
  # then rebuild all native addons from source for this Linux platform.
  # ssh2 (cpu-features, sshcrypto) still needs native rebuild.
  find node_modules -name '*.node' -delete
  pnpm rebuild

  # Generate Prisma client for this platform (Linux query engine binary)
  DATABASE_URL="$DB_URL" node_modules/.bin/prisma generate \
    --schema prisma/schema.prisma

  DATABASE_URL="$DB_URL" node_modules/.bin/prisma migrate deploy \
    --schema prisma/schema.prisma

  DATABASE_URL="$DB_URL" node prisma/seed.js

  pm2 restart hamyar-ops-api hamyar-ops-ui 2>/dev/null || \
    pm2 start /opt/hamyar/ops/ecosystem.ops.config.js

  pm2 save
  echo "Deploy complete."
REMOTE

echo "==> Done. Check: https://ops.hamyar.app"
