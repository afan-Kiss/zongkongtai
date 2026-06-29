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
for cmd in [
    "which node; which npm; node -v",
    "pm2 show zhubo-control-center 2>/dev/null | head -25",
    "ls -la /www/wwwroot/zhubo-control-center/.env",
    "test -f /root/.nvm/nvm.sh && echo nvm_ok || echo no_nvm",
]:
    _, o, _ = c.exec_command(cmd)
    print(">>>", cmd)
    print(o.read().decode())
c.close()
