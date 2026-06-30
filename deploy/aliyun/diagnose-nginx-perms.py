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
    "ls -la /var/lib/aa_nginx/ /var/lib/aa_nginx/tmp/ /var/lib/aa_nginx/tmp/client_body/",
    "namei -l /var/lib/aa_nginx/tmp/client_body/",
    "getenforce 2>/dev/null || echo no-selinux",
    "runuser -u nginx -- touch /var/lib/aa_nginx/tmp/client_body/test-write && echo touch-ok || echo touch-fail",
    "grep client_body /etc/aa_nginx/conf.d/zhubo-analysis.conf",
    "chmod 1777 /var/lib/aa_nginx/tmp/client_body && runuser -u nginx -- touch /var/lib/aa_nginx/tmp/client_body/test-write2 && echo touch2-ok",
]
for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=20)
    out = o.read().decode("utf-8", errors="replace").rstrip()
    err = e.read().decode("utf-8", errors="replace").rstrip()
    if out:
        print(out)
    if err:
        print("ERR:", err)
c.close()
