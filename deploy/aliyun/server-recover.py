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

BAK = "/tmp/control-prod-db-backup-274158.db"
DB = "/www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db"
DEPLOY = "/www/wwwroot/zhubo-control-center"

for label, cmd in [
    ("bak_secrets", f"sqlite3 {BAK} \"select count(*) from SecretStore;\""),
    ("bak_shops", f"sqlite3 {BAK} \"select shopName from SecretStore limit 8;\""),
    ("cur_secrets", f"sqlite3 {DB} \"select count(*) from SecretStore;\""),
]:
    _, o, _ = c.exec_command(cmd, timeout=20)
    sp(f"{label}: {o.read().decode().strip()}")

# Restore DB from backup if backup has more secrets
_, o, _ = c.exec_command(f"sqlite3 {BAK} \"select count(*) from SecretStore;\"", timeout=20)
bak_count = int(o.read().decode().strip() or "0")
_, o, _ = c.exec_command(f"sqlite3 {DB} \"select count(*) from SecretStore;\"", timeout=20)
cur_count = int(o.read().decode().strip() or "0")

if bak_count > cur_count:
    sp(f"Restoring prod.db from backup (bak={bak_count} cur={cur_count})")
    restore = f"""
cp {BAK} {DB}
chmod 644 {DB}
"""
    c.exec_command(restore, timeout=30)
else:
    sp(f"No restore needed (bak={bak_count} cur={cur_count})")

# Start PM2
start_cmd = f"""
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
cd {DEPLOY}
pm2 delete zhubo-control-center 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 3
curl -sf http://127.0.0.1:4790/api/health
curl -sf http://8.137.126.18/control/api/health
"""
_, o, e = c.exec_command(start_cmd, timeout=120)
sp("pm2_start:\n" + o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    sp("pm2_err:\n" + err)

c.close()
