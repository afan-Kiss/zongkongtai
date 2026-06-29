"""Verify secrets list masking and operation logs on remote."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = "/www/wwwroot/zhubo-control-center"


def load_all() -> None:
    spec = importlib.util.spec_from_file_location(
        "load_deploy_env", ROOT / "scripts" / "load-deploy-env.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.load_all()


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main() -> int:
    load_all()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=os.environ["SSH_PASS"], timeout=15)
    _, o, _ = c.exec_command(f"cat {DEPLOY}/.env", timeout=15)
    env = parse_env(o.read().decode("utf-8", errors="replace"))
    login = json.dumps({"username": env.get("ADMIN_USERNAME", "admin"), "password": env.get("ADMIN_PASSWORD", "")})
    py = r"""
import json, urllib.request
login = json.loads(open('/tmp/login.json').read())
req = urllib.request.Request('http://127.0.0.1:4790/api/auth/login', data=json.dumps(login).encode(), headers={'Content-Type':'application/json'}, method='POST')
res = urllib.request.urlopen(req, timeout=15)
cookies = res.headers.get_all('Set-Cookie') or []
cookie = '; '.join([c.split(';')[0] for c in cookies])
req2 = urllib.request.Request('http://127.0.0.1:4790/api/secrets', headers={'Cookie': cookie})
secrets = json.load(urllib.request.urlopen(req2, timeout=15))
req3 = urllib.request.Request('http://127.0.0.1:4790/api/dashboard/operations', headers={'Cookie': cookie})
ops = json.load(urllib.request.urlopen(req3, timeout=15))
print('secrets_count', len(secrets))
print('has_encrypted', any('encryptedValue' in s for s in secrets))
print('has_preview', any(s.get('valuePreview') for s in secrets))
actions = [o.get('action') for o in ops[:40]]
print('has_upload', 'qianfan_cookie_upload' in actions)
print('has_resolve', 'secret_resolve' in actions)
qianfan = [s.get('shopName') for s in secrets if s.get('platform')=='qianfan']
print('qianfan_shops', len(qianfan))
"""
    c.exec_command(f"echo '{login}' > /tmp/login.json", timeout=10)
    _, o2, e2 = c.exec_command(f"python3 -c '{py}'", timeout=60)
    out = o2.read().decode("ascii", errors="replace")
    err = e2.read().decode("ascii", errors="replace")
    print(out.strip())
    if err.strip():
        print("py_err", err[:200])
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
