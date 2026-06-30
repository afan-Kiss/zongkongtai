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
    "grep -r client_max_body_size /www/server/panel/vhost/nginx/ /etc/aa_nginx/ 2>/dev/null | head -20",
    "grep -A35 'location /control' /www/server/panel/vhost/nginx/*.conf /etc/aa_nginx/conf.d/*.conf 2>/dev/null | head -50",
    "tail -30 /www/wwwlogs/*.error.log 2>/dev/null | tail -20",
]
for cmd in cmds:
    print("\n>>>", cmd[:100])
    _, o, _ = c.exec_command(cmd, timeout=20)
    out = o.read().decode("utf-8", errors="replace").rstrip()
    print(out or "(empty)")
c.close()
