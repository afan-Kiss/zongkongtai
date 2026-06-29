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
    "find /www/wwwroot/zhubo-control-center -name 'prod.db*' -ls 2>/dev/null",
    "find /www/wwwroot/zhubo-control-center -name '*.db' -ls 2>/dev/null",
    "cat /www/wwwroot/zhubo-control-center/.env",
    "pm2 status",
    "cat /www/wwwroot/zhubo-control-center/ecosystem.config.cjs",
    "ls -la /www/wwwroot/zhubo-control-center/apps/control-server/dist/index.js 2>&1",
]
for cmd in cmds:
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(">>>", cmd)
    print(o.read().decode("utf-8", errors="replace"))

c.close()
