#!/usr/bin/env python3
import json
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pwd = next(
    line.split("=", 1)[1].strip().strip('"').strip("'")
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
    if line.startswith("SSH_PASS=")
)
token = next(
    line.split("=", 1)[1].strip()
    for line in (ROOT / "deploy-output-credentials.txt").read_text(encoding="utf-8").splitlines()
    if line.startswith("SERVICE_TOKEN=")
)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

body = json.dumps(
    {
        "platform": "qianfan",
        "shopName": "和田雅玉",
        "cookie": "a=b; c=d; session=" + "x" * 40,
        "source": "ssh-test",
        "collectorMachine": "ssh",
    }
)

cmds = [
    "curl -sf http://127.0.0.1:4790/api/health",
    f"""curl -s -o /tmp/up.json -w '%{{http_code}}' -X POST http://127.0.0.1:4790/api/secrets/qianfan/upload-cookie -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -H 'x-service-token: {token}' -d '{body}'""",
    "cat /tmp/up.json",
    "grep -r control /etc/nginx 2>/dev/null | head -5; grep -r 4790 /etc/aa_nginx 2>/dev/null | head -10; ls /etc/aa_nginx/conf.d/ 2>/dev/null | head -10",
]
for cmd in cmds:
    _, o, _ = c.exec_command(cmd, timeout=60)
    print(">>>", cmd[:120])
    print(o.read().decode("utf-8", errors="replace"))
c.close()
