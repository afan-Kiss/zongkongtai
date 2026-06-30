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
cmd = """
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
cd /www/wwwroot/zhubo-control-center/apps/control-server
which node; node -v
ls -la prisma/seed.ts
npx tsx --version 2>&1 | head -1
"""
_, o, e = c.exec_command(cmd, timeout=60)
sp("OUT:\n" + o.read().decode("utf-8", errors="replace"))
sp("ERR:\n" + e.read().decode("utf-8", errors="replace"))
c.close()
