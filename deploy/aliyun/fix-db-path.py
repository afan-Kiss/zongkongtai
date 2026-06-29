#!/usr/bin/env python3
"""Fix DATABASE_URL path and consolidate prod.db to prisma/prod.db."""
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

DEPLOY = "/www/wwwroot/zhubo-control-center"
PRISMA = f"{DEPLOY}/apps/control-server/prisma"
cmd = f"""
set -e
# Fix .env: Prisma resolves SQLite path relative to schema dir (prisma/)
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=file:./prod.db|' {DEPLOY}/.env
# Use nested db if it has more data than flat prod.db
NEST="{PRISMA}/prisma/prod.db"
FLAT="{PRISMA}/prod.db"
if [ -f "$NEST" ]; then
  n=$(sqlite3 "$NEST" "select count(*) from User;" 2>/dev/null || echo 0)
  f=$(sqlite3 "$FLAT" "select count(*) from User;" 2>/dev/null || echo 0)
  if [ "$n" -gt "$f" ] 2>/dev/null; then
    cp "$NEST" "$FLAT"
  fi
fi
rm -rf "{PRISMA}/prisma"
sqlite3 "$FLAT" "select count(*) from User;"
sqlite3 "$FLAT" "select count(*) from SecretStore;"
grep DATABASE_URL {DEPLOY}/.env
cd {DEPLOY}
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
pm2 restart zhubo-control-center
sleep 2
curl -sf http://8.137.126.18/control/api/health
"""
_, o, e = c.exec_command(cmd, timeout=120)
sp(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    sp("ERR: " + err)
c.close()
