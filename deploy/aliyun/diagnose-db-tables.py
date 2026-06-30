#!/usr/bin/env python3
import os
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

cmds = [
    "grep DATABASE_URL /www/wwwroot/zhubo-control-center/.env /www/wwwroot/zhubo-control-center/apps/control-server/.env 2>/dev/null",
    "ls -la /www/wwwroot/zhubo-control-center/apps/control-server/prod.db /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db 2>&1",
    "for f in /www/wwwroot/zhubo-control-center/apps/control-server/prod.db /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db; do echo \"=== $f ===\"; sqlite3 \"$f\" \"select name from sqlite_master where type='table' order by name;\" 2>&1; sqlite3 \"$f\" \"select 'SecretStore', count(*) from SecretStore union all select 'Project', count(*) from Project union all select 'Agent', count(*) from Agent;\" 2>&1; done",
    "cat /www/wwwroot/zhubo-control-center/ecosystem.config.cjs | head -40",
]
for cmd in cmds:
    print("\n>>>", cmd[:140])
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", errors="replace").rstrip())
    err = e.read().decode("utf-8", errors="replace").strip()
    if err:
        print("ERR:", err)
c.close()
