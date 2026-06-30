#!/usr/bin/env python3
"""Inspect and fix SQLite writable state for control-center."""
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

cmd = r"""
set -e
PRISMA=/www/wwwroot/zhubo-control-center/apps/control-server/prisma
DB=$PRISMA/prod.db
echo "=== ls prisma ==="
ls -la $PRISMA
echo "=== pm2 user ==="
ps -o user,pid,cmd -p $(pgrep -f 'control-server/dist/index' | head -1) 2>/dev/null || ps aux | grep control-server | grep -v grep
echo "=== DATABASE_URL ==="
grep DATABASE_URL /www/wwwroot/zhubo-control-center/.env
echo "=== sqlite write test ==="
sqlite3 $DB "BEGIN; SELECT 1; ROLLBACK;" && echo SQLITE_OK || echo SQLITE_FAIL
echo "=== fix perms ==="
chmod 775 $PRISMA
chmod 664 $DB
chown -R root:root $PRISMA
rm -f $DB-wal $DB-shm 2>/dev/null || true
echo "=== restart control-center ==="
cd /www/wwwroot/zhubo-control-center
pm2 restart zhubo-control-center --update-env
sleep 4
curl -sf --max-time 5 http://127.0.0.1:4790/api/health; echo
TOKEN=$(grep '^SERVICE_TOKEN=' /www/wwwroot/zhubo-control-center/.env | cut -d= -f2-)
time curl -sf --max-time 20 -X POST http://127.0.0.1:4790/api/secrets/qianfan/upload-cookie \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"platform":"qianfan","shopName":"部署验收测试店","cookie":"perm-test=2; xhsTrackerId=probe","collectorProject":"perm-fix-probe"}'
echo
"""
_, o, e = c.exec_command(cmd, timeout=90)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[:500])
c.close()
