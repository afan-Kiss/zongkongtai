#!/usr/bin/env python3
import paramiko, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmd = """
cd /www/wwwroot/zhubo-control-center/apps/control-server
export NVM_DIR=/root/.nvm && [ -s /root/.nvm/nvm.sh ] && . /root/.nvm/nvm.sh || true
npx tsx prisma/seed.ts 2>&1 | tail -5
"""
_, o, e = c.exec_command(cmd, timeout=120)
sys.stdout.buffer.write(o.read())
c.close()
