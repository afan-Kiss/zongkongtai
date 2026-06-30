#!/usr/bin/env bash
set -euo pipefail
ROOT="/www/wwwroot/zhubo-control-center"
cd "$ROOT"

echo "==> Database"
cd apps/control-server
export DATABASE_URL="${DATABASE_URL:-file:./prod.db}"
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts || true
cd "$ROOT"

mkdir -p logs

echo "==> PM2 start"
pm2 delete zhubo-control-center 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Nginx (aa_nginx)"
cat > /etc/aa_nginx/conf.d/zhubo-control-center.conf << 'NGXEOF'
server {
    listen 4880;
    server_name 8.137.126.18;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4790;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    access_log /www/wwwlogs/zhubo-control-center.access.log;
    error_log /www/wwwlogs/zhubo-control-center.error.log;
}
NGXEOF
/usr/sbin/aa_nginx -t
systemctl reload aa_nginx
iptables -C INPUT -p tcp --dport 4880 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 4880 -j ACCEPT

sleep 2
curl -sf http://127.0.0.1:4790/api/health
curl -sf --max-time 10 http://127.0.0.1:4880/api/health
pm2 status | grep control || pm2 status
