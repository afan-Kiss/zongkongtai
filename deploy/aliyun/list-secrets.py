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
for db in [
    "/www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db",
    "/www/wwwroot/zhubo-control-center/apps/control-server/prisma/prisma/prod.db",
]:
    sp(f"\n== {db} ==")
    _, o, _ = c.exec_command(
        f'sqlite3 {db} "select shopName, keyName, valuePreview from SecretStore;"',
        timeout=20,
    )
    sp(o.read().decode("utf-8", errors="replace").strip() or "(empty)")
c.close()
