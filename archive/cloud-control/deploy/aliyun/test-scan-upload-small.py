#!/usr/bin/env python3
"""Upload a minimal scan payload through public nginx with server AGENT_TOKEN."""
import json
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

REMOTE = r"""python3 - <<'PY'
import json, os, urllib.request, urllib.error
env = open('/www/wwwroot/zhubo-control-center/.env').read()
token = ''
for line in env.splitlines():
    if line.startswith('AGENT_TOKEN='):
        token = line.split('=', 1)[1].strip().strip('"').strip("'")
        break
# minimal 1-project payload
body = json.dumps({
  'agentId': 'probe', 'scannedAt': '2026-06-29T00:00:00Z', 'basePath': 'E:/x',
  'projects': [{
    'code': 'probe-test', 'name': 'Probe', 'category': 'test', 'localPath': 'E:/x',
    'ports': [{'port': 49999, 'protocol': 'tcp', 'host': '127.0.0.1', 'sourceType': 'manifest',
               'purpose': '[manifest:service] probe :49999', 'sourceFile': 'test.json'}]
  }],
  'runtimePorts': [], 'unknownPorts': []
}).encode()
url = 'http://8.137.126.18/control/api/ports/import'
req = urllib.request.Request(url, data=body, method='POST', headers={
    'Content-Type': 'application/json', 'x-agent-token': token
})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print('status', r.status, r.read()[:500].decode())
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read()[:500].decode())
except Exception as e:
    print('ERR', type(e).__name__, str(e)[:200])
PY"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, e = c.exec_command(REMOTE, timeout=90)
print(o.read().decode("utf-8", errors="replace"))
c.close()
