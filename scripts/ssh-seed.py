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

def run(cmd: str) -> int:
    print(f"\n>>> {cmd[:260]}")
    _, o, e = c.exec_command(cmd, timeout=600)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    return code

run(
    """
cd /www/wwwroot/zhubo-control-center/apps/control-server
export DATABASE_URL=file:./prisma/prod.db
npx tsx prisma/seed.ts || true
"""
)

c.close()
