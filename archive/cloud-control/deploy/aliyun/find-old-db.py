#!/usr/bin/env python3
import sys
import paramiko
from pathlib import Path

def sp(s):
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    print(s.encode(enc, errors="replace").decode(enc, errors="replace"))

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmds = [
    "find /www/wwwroot -name 'prod.db' 2>/dev/null | head -20",
    "for f in $(find /tmp -name 'control-prod-db-backup*.db' 2>/dev/null); do echo $f $(sqlite3 $f \"select count(*) from SecretStore;\" 2>/dev/null); done",
    "ls -la /www/wwwroot/zhubo-control-center/apps/control-server/prisma/*.db* 2>/dev/null",
]
for cmd in cmds:
    sp("\n>>> " + cmd[:150])
    _, o, _ = c.exec_command(cmd, timeout=60)
    sp(o.read().decode("utf-8", errors="replace").strip())
c.close()
