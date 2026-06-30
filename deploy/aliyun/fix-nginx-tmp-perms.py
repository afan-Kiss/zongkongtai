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
    "grep '^user' /etc/aa_nginx/nginx.conf",
    "ps aux | grep 'nginx: worker' | head -3",
    "tail -5 /www/wwwlogs/zhubo-analysis.error.log",
    "chown -R nginx:nginx /var/lib/aa_nginx/tmp && chmod -R 770 /var/lib/aa_nginx/tmp",
    "ls -la /var/lib/aa_nginx/tmp/client_body/",
]
for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=20)
    print(o.read().decode("utf-8", errors="replace").rstrip())
    err = e.read().decode("utf-8", errors="replace").strip()
    if err:
        print("ERR:", err)
c.close()
