#!/usr/bin/env python3
import sys
import paramiko
from pathlib import Path

def sp(s):
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    print(s.encode(enc, errors="replace").decode(enc, errors="replace"))

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

cmd = r"""
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
cd /www/wwwroot/zhubo-control-center/apps/control-server
export ADMIN_USERNAME=$(grep ^ADMIN_USERNAME= ../../.env | cut -d= -f2-)
export ADMIN_PASSWORD=$(grep ^ADMIN_PASSWORD= ../../.env | cut -d= -f2-)
export DATABASE_URL=file:./prisma/prod.db
npx tsx prisma/seed.ts 2>&1
sqlite3 prisma/prod.db "select count(*) from User;"
cd /www/wwwroot/zhubo-control-center
pm2 restart zhubo-control-center
sleep 2
curl -sf http://8.137.126.18/control/api/health
"""
_, o, e = c.exec_command(cmd, timeout=180)
sp(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    sp("ERR: " + err)
c.close()
