#!/usr/bin/env python3
import os
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[2]
payload_path = ROOT / "tmp-scan.json"
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
if payload_path.exists():
    sftp = c.open_sftp()
    sftp.put(str(payload_path), "/tmp/full-scan.json")
    sftp.close()

cmd = r"""TOKEN=$(grep '^AGENT_TOKEN=' /www/wwwroot/zhubo-control-center/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
echo "=== direct 4790 ==="
curl -s -m 120 -w '\ncode:%{http_code}\n' -X POST http://127.0.0.1:4790/api/ports/import \
  -H 'Content-Type: application/json' -H "x-agent-token: $TOKEN" \
  --data-binary @/tmp/full-scan.json | tail -c 1500
echo "=== nginx public ==="
curl -s -m 120 -w '\ncode:%{http_code}\n' -X POST http://8.137.126.18/control/api/ports/import \
  -H 'Content-Type: application/json' -H "x-agent-token: $TOKEN" \
  --data-binary @/tmp/full-scan.json | tail -c 800
echo "=== pm2 error tail ==="
tail -20 /www/wwwroot/zhubo-control-center/logs/pm2-error.log 2>/dev/null
"""
_, o, e = c.exec_command(cmd, timeout=180)
print(o.read().decode("utf-8", errors="replace"))
c.close()
