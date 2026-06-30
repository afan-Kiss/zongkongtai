#!/usr/bin/env python3
import os
import sys
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
    "curl -s -m 5 -o /dev/null -w 'health:%{http_code}\\n' http://127.0.0.1:4790/api/health",
    "TOKEN=$(grep '^AGENT_TOKEN=' /www/wwwroot/zhubo-control-center/.env | cut -d= -f2- | tr -d '\"' | tr -d \"'\"); curl -s -m 15 -w '\\ncode:%{http_code}\\n' -X POST http://127.0.0.1:4790/api/ports/import -H 'Content-Type: application/json' -H \"x-agent-token: $TOKEN\" -d '{\"agentId\":\"probe\",\"scannedAt\":\"2026-06-29T00:00:00Z\",\"basePath\":\"/x\",\"projects\":[],\"runtimePorts\":[],\"unknownPorts\":[]}'",
    "TOKEN=$(grep '^AGENT_TOKEN=' /www/wwwroot/zhubo-control-center/.env | cut -d= -f2- | tr -d '\"' | tr -d \"'\"); curl -s -m 15 -w '\\ncode:%{http_code}\\n' -X POST http://8.137.126.18/control/api/ports/import -H 'Content-Type: application/json' -H \"x-agent-token: $TOKEN\" -d '{\"agentId\":\"probe\",\"scannedAt\":\"2026-06-29T00:00:00Z\",\"basePath\":\"/x\",\"projects\":[],\"runtimePorts\":[],\"unknownPorts\":[]}'",
    "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh; pm2 logs zhubo-control-center --lines 15 --nostream 2>&1 | tail -20",
]
for cmd in cmds:
    print("\n>>>", cmd[:120])
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("ERR:", err.rstrip())
c.close()
