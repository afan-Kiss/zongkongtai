#!/usr/bin/env python3
import paramiko, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmds = [
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db \".schema OperationLog\"",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db \"select action, count(*) from OperationLog group by action order by count(*) desc limit 20;\"",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db \"select action, datetime(createdAt/1000,'unixepoch'), detail from OperationLog order by createdAt desc limit 15;\"",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db \"select username from User;\"",
    "pm2 status | grep -E 'analysis|control'",
]
for cmd in cmds:
    print(">>>", cmd[:75])
    _, o, _ = c.exec_command(cmd, timeout=20)
    sys.stdout.buffer.write(o.read())
    print()
c.close()
