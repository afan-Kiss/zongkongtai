"""Test upload on server localhost with env token (no secret output)."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]


def load_all() -> None:
    spec = importlib.util.spec_from_file_location(
        "load_deploy_env", ROOT / "scripts" / "load-deploy-env.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.load_all()


def parse_token(text: str) -> str:
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("SERVICE_TOKEN="):
            return s.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    load_all()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=os.environ["SSH_PASS"], timeout=15)
    _, o, _ = c.exec_command("cat /www/wwwroot/zhubo-control-center/.env", timeout=15)
    token = parse_token(o.read().decode("utf-8", errors="replace"))
    print("token_len", len(token))
    body = json.dumps(
        {
            "platform": "qianfan",
            "shopName": "测试店铺",
            "cookie": "a=1; b=2; xhsTrackerId=localtest",
            "collectorProject": "server-local-test",
            "capturedAt": "2026-06-29T10:30:00.000Z",
        }
    )
    cmd = f"""
curl -s -w ' code=%{{http_code}}' -X POST http://127.0.0.1:4790/api/secrets/qianfan/upload-cookie \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer {token}' \\
  -d '{body}'
echo
"""
    _, o2, _ = c.exec_command(cmd, timeout=30)
    raw = o2.read().decode("ascii", errors="replace")
    safe = raw.encode("ascii", errors="replace").decode("ascii")
    print("response", safe.strip()[:200])
    print("has_ok", '"ok":true' in safe or '"ok": true' in safe)
    # check process env via node
    cmd2 = f"cd /www/wwwroot/zhubo-control-center && node -e \"require('dotenv').config(); console.log('dotenv_len', (process.env.SERVICE_TOKEN||'').length)\""
    _, o3, _ = c.exec_command(cmd2, timeout=30)
    print(o3.read().decode("ascii", errors="replace").strip())
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
