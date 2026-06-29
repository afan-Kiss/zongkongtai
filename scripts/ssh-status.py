#!/usr/bin/env python3
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmds = [
    "curl -sf --max-time 5 http://127.0.0.1:4790/api/health || echo HEALTH_FAIL",
    "pm2 status | grep control || pm2 status | head -15",
    "ls -la /www/wwwroot/zhubo-control-center/.env 2>&1 | head -3",
    "test -f /www/wwwroot/zhubo-control-center/apps/control-server/dist/index.js && echo dist_ok || echo dist_missing",
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=30)
    print(">>>", cmd)
    print(o.read().decode())
    err = e.read().decode()
    if err.strip():
        print(err)
c.close()
