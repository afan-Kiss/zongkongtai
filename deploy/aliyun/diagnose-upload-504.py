#!/usr/bin/env python3
"""Diagnose upload 504: nginx timeout + pm2 logs + local upload latency."""
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
token = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")
    if line.startswith("SERVICE_TOKEN="):
        token = line.split("=", 1)[1].strip()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

cmds = [
    "grep -r proxy_read_timeout /etc/aa_nginx/conf.d/ 2>/dev/null | head -20",
    "grep -A30 'location /control' /etc/aa_nginx/conf.d/*.conf 2>/dev/null | head -40",
    "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh; pm2 logs zhubo-control-center --lines 30 --nostream 2>&1 | tail -35",
    "ls -la /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db* 2>/dev/null",
    """python3 - <<'PY'
import json, time, urllib.request
token = open('/www/wwwroot/zhubo-control-center/.env').read().split('SERVICE_TOKEN=')[1].split('\\n')[0].strip()
body = json.dumps({
  'platform': 'qianfan', 'shopName': '部署验收测试店',
  'cookie': 'ping=1; xhsTrackerId=latency-test', 'collectorProject': 'latency-probe'
}).encode()
for label, url in [('local4790', 'http://127.0.0.1:4790/api/secrets/qianfan/upload-cookie'),
                   ('public', 'http://8.137.126.18/control/api/secrets/qianfan/upload-cookie')]:
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'
    })
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print(label, r.status, round(time.time()-t0, 2), 's', r.read()[:80])
    except Exception as e:
        print(label, 'ERR', round(time.time()-t0, 2), 's', type(e).__name__, str(e)[:120])
PY""",
]
for cmd in cmds:
    print("\n>>>", cmd[:100].replace("\n", " "))
    _, o, e = c.exec_command(cmd, timeout=150)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("STDERR:", err[:500])
c.close()
