#!/usr/bin/env python3
import sys
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmd = """
ls -la /www/wwwroot/zhubo-control-center/apps/control-server/prisma/
curl -sf --max-time 5 http://127.0.0.1:4790/api/health; echo
sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db "select shopName, substr(cookieHash,1,8), updatedAt from SecretStore where platform='qianfan' order by updatedAt desc limit 10;"
"""
_, o, e = c.exec_command(cmd, timeout=30)
out = o.read().decode("utf-8", errors="replace")
sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
c.close()
