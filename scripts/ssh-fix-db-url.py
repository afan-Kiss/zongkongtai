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

def run(cmd: str) -> None:
    print(f"\n>>> {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err)

run(
    """
cd /www/wwwroot/zhubo-control-center
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=file:./prod.db|' .env
grep DATABASE_URL .env
pm2 restart zhubo-control-center --update-env
sleep 2
curl -sf http://127.0.0.1:4790/api/health
"""
)

c.close()
