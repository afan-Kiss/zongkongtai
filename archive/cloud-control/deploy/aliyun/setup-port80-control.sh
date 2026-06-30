#!/usr/bin/env bash
set -euo pipefail
ROOT="/www/wwwroot/zhubo-control-center"
cd "$ROOT"

npm run build -w @zhubo/control-web

CONF="/etc/aa_nginx/conf.d/zhubo-analysis.conf"
SNIPPET='location /control/ {
    proxy_pass http://127.0.0.1:4790/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}'

if ! grep -q 'location /control/' "$CONF"; then
  sed -i "/access_log/i $SNIPPET" "$CONF"
fi

/usr/sbin/aa_nginx -t
master_pid=$(ps aux | awk '/nginx: master process \/usr\/sbin\/aa_nginx/ && !/grep/ {print $2; exit}')
kill -HUP "$master_pid"

sleep 1
curl -sf http://127.0.0.1/control/api/health
echo " port80-control-ok"
