#!/usr/bin/env python3
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
pwd = os.environ.get("SSH_PASS", "")
if not pwd and (ROOT / ".env").exists():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("SSH_PASS="):
            pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

cmds = [
    "curl -sf http://127.0.0.1:4790/api/health",
    'curl -s -o /dev/null -w "import-local:%{http_code}\\n" -X POST http://127.0.0.1:4790/api/projects/import-manifests -H "Content-Type: application/json" -d "{}"',
    'curl -s -o /dev/null -w "ports-import:%{http_code}\\n" -X POST http://127.0.0.1:4790/api/ports/import -H "Content-Type: application/json" -d "{\\"agentId\\":\\"test\\",\\"scannedAt\\":\\"2026-01-01T00:00:00Z\\",\\"basePath\\":\\"/x\\",\\"projects\\":[],\\"runtimePorts\\":[],\\"unknownPorts\\":[]}"',
    "tail -20 /root/.pm2/logs/zhubo-control-center-out.log 2>/dev/null",
    "tail -20 /root/.pm2/logs/zhubo-control-center-error.log 2>/dev/null",
    "sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prod.db \"select action, count(*) from OperationLog group by action order by count(*) desc limit 10;\"",
]
for cmd in cmds:
    print("\n>>>", cmd[:100])
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("ERR:", err.rstrip())
c.close()
