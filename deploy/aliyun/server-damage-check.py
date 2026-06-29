#!/usr/bin/env python3
import sys
import os
import paramiko
from pathlib import Path

def safe_print(s: str) -> None:
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
cmds = [
    "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 status",
    "ls -la /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db 2>/dev/null || echo NO_DB",
    "ls -la /tmp/control-prod-db-backup*.db 2>/dev/null | tail -3 || echo NO_BAK",
    "curl -sf --max-time 5 http://8.137.126.18/control/api/health || echo HEALTH_FAIL",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db 'select count(*) from SecretStore;' 2>/dev/null || echo SECRET_COUNT_FAIL",
]
for cmd in cmds:
    safe_print("\n>>> " + cmd[:100])
    _, o, _ = c.exec_command(cmd, timeout=30)
    safe_print(o.read().decode("utf-8", errors="replace").strip())
c.close()
