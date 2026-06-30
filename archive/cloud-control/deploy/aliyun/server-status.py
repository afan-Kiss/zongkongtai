#!/usr/bin/env python3
"""Quick PM2 / health status on server."""
import os
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
for cmd in [
    "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 status | grep -E 'control|analysis' || pm2 status",
    "curl -sf --max-time 5 http://127.0.0.1:4790/api/health || echo LOCAL_HEALTH_FAIL",
    "curl -sf --max-time 5 http://8.137.126.18/control/api/health || echo PUBLIC_HEALTH_FAIL",
    "test -f /www/wwwroot/zhubo-control-center/.env && echo ENV_OK || echo ENV_MISSING",
]:
    print("\n>>>", cmd[:80])
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", errors="replace").strip())
c.close()
