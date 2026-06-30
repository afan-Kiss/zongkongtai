#!/usr/bin/env python3
"""Recover DB access + nginx /control/ read timeout (HUP reload only, no nginx restart)."""
import sys
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

REMOTE = r"""
set -e
DEPLOY=/www/wwwroot/zhubo-control-center
PRISMA=$DEPLOY/apps/control-server/prisma
DB=$PRISMA/prod.db

echo "=== stop control-center ==="
pm2 stop zhubo-control-center || true
sleep 2

echo "=== fix db perms ==="
chmod 775 "$PRISMA"
chmod 664 "$DB"
chown -R root:root "$PRISMA"
rm -f "$DB-wal" "$DB-shm" 2>/dev/null || true
sqlite3 "$DB" "PRAGMA integrity_check;" | head -1

echo "=== patch nginx /control/ timeouts (HUP only) ==="
python3 - <<'PY'
from pathlib import Path
conf = Path("/etc/aa_nginx/conf.d/zhubo-analysis.conf")
text = conf.read_text(encoding="utf-8")
needle = "    location /control/ {"
if needle not in text:
    raise SystemExit("control location missing")
if "proxy_read_timeout 180s;" not in text:
    text = text.replace(
        "        proxy_set_header Connection \"upgrade\";\n    }",
        "        proxy_set_header Connection \"upgrade\";\n"
        "        proxy_connect_timeout 60s;\n"
        "        proxy_send_timeout 180s;\n"
        "        proxy_read_timeout 180s;\n"
        "        client_max_body_size 10m;\n"
        "    }",
        1,
    )
    conf.write_text(text, encoding="utf-8")
    print("nginx patched")
else:
    print("nginx already has timeout")
PY
/usr/sbin/aa_nginx -t
master_pid=$(ps aux | awk '/nginx: master process \/usr\/sbin\/aa_nginx/ && !/grep/ {print $2; exit}')
kill -HUP "$master_pid"
echo "nginx reloaded via HUP pid=$master_pid"

echo "=== start control-center ==="
cd "$DEPLOY"
pm2 start ecosystem.config.cjs --only zhubo-control-center --update-env
sleep 4
curl -sf --max-time 8 http://127.0.0.1:4790/api/health; echo

echo "=== upload probe ==="
TOKEN=$(grep '^SERVICE_TOKEN=' "$DEPLOY/.env" | cut -d= -f2-)
curl -sf --max-time 20 -X POST http://127.0.0.1:4790/api/secrets/qianfan/upload-cookie \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"platform":"qianfan","shopName":"部署验收测试店","cookie":"recover=1; xhsTrackerId=probe","collectorProject":"recover-probe"}'
echo
curl -sf --max-time 25 -X POST http://8.137.126.18/control/api/secrets/qianfan/upload-cookie \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"platform":"qianfan","shopName":"部署验收测试店","cookie":"recover=2; xhsTrackerId=probe","collectorProject":"recover-probe-public"}'
echo
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, e = c.exec_command(REMOTE, timeout=120)
out = o.read().decode("utf-8", errors="replace")
sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    sys.stdout.buffer.write(("ERR: " + err[:600]).encode("utf-8", errors="replace"))
c.close()
