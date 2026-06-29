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

cmds = [
    "tail -50 /www/wwwroot/zhubo-control-center/logs/pm2-error.log 2>/dev/null",
    "tail -30 /www/wwwroot/zhubo-control-center/logs/pm2-out.log 2>/dev/null",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db '.tables'",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db \"PRAGMA table_info(SecretStore);\"",
    "ls -la /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db",
    "pm2 logs zhubo-control-center --lines 20 --nostream 2>&1",
]
for cmd in cmds:
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(">>>", cmd[:100])
    print(o.read().decode("utf-8", errors="replace")[:4000])
c.close()
