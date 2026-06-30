#!/usr/bin/env python3
import paramiko, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmds = [
    "tail -20 /www/wwwroot/zhubo-control-center/logs/pm2-error.log",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db \"select shopName, substr(cookieHash,1,8), datetime(updatedAt/1000,'unixepoch') from SecretStore where platform='qianfan';\"",
]
for cmd in cmds:
    print(">>>", cmd[:70])
    _, o, _ = c.exec_command(cmd, timeout=20)
    sys.stdout.buffer.write(o.read())
    print()
c.close()
