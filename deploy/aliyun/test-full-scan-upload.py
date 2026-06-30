#!/usr/bin/env python3
import json
import os
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
payload_path = ROOT / "tmp-scan.json"
if not payload_path.exists():
    raise SystemExit("missing tmp-scan.json")

body = payload_path.read_bytes()
json.loads(body.decode("utf-8"))  # validate
print("local payload bytes:", len(body))

pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
sftp = c.open_sftp()
sftp.put(str(payload_path), "/tmp/full-scan.json")
sftp.close()

remote = r"""python3 - <<'PY'
import json, re, urllib.request, urllib.error
env = open('/www/wwwroot/zhubo-control-center/.env', encoding='utf-8').read()
m = re.search(r'^AGENT_TOKEN=(.*)$', env, re.M)
token = m.group(1).strip().strip('"').strip("'") if m else ''
body = open('/tmp/full-scan.json', 'rb').read()
print('remote payload bytes:', len(body))
for label, url in [
    ('local4790', 'http://127.0.0.1:4790/api/ports/import'),
    ('public', 'http://8.137.126.18/control/api/ports/import'),
]:
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'Content-Type': 'application/json',
        'x-agent-token': token,
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print(label, r.status, r.read()[:1000].decode('utf-8', errors='replace'))
    except urllib.error.HTTPError as e:
        print(label, 'HTTP', e.code, e.read()[:1000].decode('utf-8', errors='replace'))
    except Exception as e:
        print(label, 'ERR', type(e).__name__, str(e)[:200])
PY"""
_, o, e = c.exec_command(remote, timeout=180)
print(o.read().decode("utf-8", errors="replace"))
c.close()
