#!/usr/bin/env python3
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pwd = next(
    line.split("=", 1)[1].strip().strip('"').strip("'")
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
    if line.startswith("SSH_PASS=")
)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

def run(cmd: str) -> None:
    print(f"\n>>> {cmd[:300]}")
    _, o, e = c.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err)

run("find /tmp -name '*prod.db*' -ls 2>/dev/null | head -10")
run("find /www -name 'prod.db' -size +10k -ls 2>/dev/null | head -20")
run("sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prisma/prod.db \"select count(*) from SecretStore;\" 2>&1")
run("sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prisma/prod.db \"select shopName, updatedAt from SecretStore where platform='qianfan' limit 10;\" 2>&1")
run("tail -30 /www/wwwroot/zhubo-control-center/logs/pm2-error.log 2>/dev/null")

# Fix DB path and restart
run(
    """
set -e
cd /www/wwwroot/zhubo-control-center
DB=/www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db
NESTED=/www/wwwroot/zhubo-control-center/apps/control-server/prisma/prisma/prod.db
if [ -f "$NESTED" ] && [ ! -s "$DB" ]; then cp "$NESTED" "$DB"; fi
if [ -f "$NESTED" ] && [ "$(stat -c%s "$DB" 2>/dev/null || echo 0)" -lt 1000 ]; then cp "$NESTED" "$DB"; fi
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=file:./apps/control-server/prisma/prod.db|' .env
grep DATABASE_URL .env
pm2 delete zhubo-control-center 2>/dev/null || true
pm2 start ecosystem.config.cjs
sleep 2
pm2 status | grep control
curl -sf http://127.0.0.1:4790/api/health
"""
)

c.close()
