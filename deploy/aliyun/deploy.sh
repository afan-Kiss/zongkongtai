#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export NVM_DIR="${NVM_DIR:-/root/.nvm}"
# shellcheck disable=SC1091
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found"
  exit 1
fi

echo "==> Install dependencies"
npm install

echo "==> Build"
npm run build

echo "==> Database"
cd apps/control-server
export DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}"
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts || true
cd "$ROOT"

mkdir -p logs

echo "==> PM2"
pm2 delete zhubo-control-center 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 2
curl -sf http://127.0.0.1:4790/api/health && echo " OK"
