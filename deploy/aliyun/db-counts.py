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
DB = "/www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db"
for q in [
    "select count(*) from User;",
    "select count(*) from SecretStore;",
    "select count(*) from Agent;",
    "select username from User;",
]:
    _, o, _ = c.exec_command(f'sqlite3 {DB} "{q}"', timeout=15)
    sp(f"{q} => {o.read().decode().strip()}")
c.close()
