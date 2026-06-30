#!/usr/bin/env python3
"""Test ports/import via local, nginx loopback, and public URL with server AGENT_TOKEN."""
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

REMOTE_SCRIPT = r"""python3 - <<'PY'
import json, urllib.request, urllib.error
env = open('/www/wwwroot/zhubo-control-center/.env').read()
agent_token = ''
for line in env.splitlines():
    if line.startswith('AGENT_TOKEN='):
        agent_token = line.split('=', 1)[1].strip().strip('"').strip("'")
        break
body = json.dumps({
  'agentId': 'probe', 'scannedAt': '2026-06-29T00:00:00Z', 'basePath': '/x',
  'projects': [], 'runtimePorts': [], 'unknownPorts': []
}).encode()
for label, url in [
    ('local4790', 'http://127.0.0.1:4790/api/ports/import'),
    ('nginx127', 'http://127.0.0.1/control/api/ports/import'),
    ('public', 'http://8.137.126.18/control/api/ports/import'),
]:
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Content-Type': 'application/json', 'x-agent-token': agent_token
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(label, r.status, r.read()[:300].decode('utf-8', errors='replace'))
    except urllib.error.HTTPError as e:
        print(label, 'HTTP', e.code, e.read()[:300].decode('utf-8', errors='replace'))
    except Exception as e:
        print(label, 'ERR', type(e).__name__, str(e)[:200])
PY"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, e = c.exec_command(REMOTE_SCRIPT, timeout=90)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err, file=sys.stderr)
c.close()
