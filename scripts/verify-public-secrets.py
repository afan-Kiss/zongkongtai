"""Verify public /control API: login, secrets masking, operation logs."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://8.137.126.18/control"


def load_all() -> None:
    spec = importlib.util.spec_from_file_location(
        "load_deploy_env", ROOT / "scripts" / "load-deploy-env.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.load_all()


def parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main() -> int:
    load_all()
    import paramiko

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=os.environ["SSH_PASS"], timeout=15)
    _, o, _ = c.exec_command("cat /www/wwwroot/zhubo-control-center/.env", timeout=15)
    remote = parse_env_file_text = {}
    for line in o.read().decode("utf-8", errors="replace").splitlines():
        s = line.strip()
        if "=" in s and not s.startswith("#"):
            k, v = s.split("=", 1)
            remote[k.strip()] = v.strip()
    c.close()

    login_body = json.dumps(
        {
            "username": remote.get("ADMIN_USERNAME", "admin"),
            "password": remote.get("ADMIN_PASSWORD", ""),
        }
    ).encode()
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=login_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        cookies = res.headers.get_all("Set-Cookie") or []
    cookie_hdr = "; ".join([x.split(";")[0] for x in cookies])

    req2 = urllib.request.Request(f"{BASE}/api/secrets", headers={"Cookie": cookie_hdr})
    with urllib.request.urlopen(req2, timeout=15) as res:
        secrets = json.loads(res.read().decode())

    req3 = urllib.request.Request(
        f"{BASE}/api/dashboard/operations", headers={"Cookie": cookie_hdr}
    )
    with urllib.request.urlopen(req3, timeout=15) as res:
        ops = json.loads(res.read().decode())

    print("secrets_count", len(secrets))
    print("has_encryptedValue", any("encryptedValue" in s for s in secrets))
    print("has_preview", any(s.get("valuePreview") for s in secrets))
    qf = [s.get("shopName") for s in secrets if s.get("platform") == "qianfan"]
    print("qianfan_shop_count", len(qf))
    actions = [o.get("action") for o in ops[:50]]
    print("has_upload_log", "qianfan_cookie_upload" in actions)
    print("has_resolve_log", "secret_resolve" in actions)
    return 0


if __name__ == "__main__":
    sys.exit(main())
