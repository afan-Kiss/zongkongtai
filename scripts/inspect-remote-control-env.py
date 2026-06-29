"""Inspect remote control center env (no secret values)."""
from __future__ import annotations

import importlib.util
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


def main() -> int:
    load_all()
    pwd = os.environ.get("SSH_PASS", "")
    if not pwd:
        print("no_ssh")
        return 1
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=pwd, timeout=15)
    cmds = [
        f"test -f {DEPLOY}/.env && echo has_root_env || echo no_root_env",
        f"test -f {DEPLOY}/apps/control-server/.env && echo has_server_env || echo no_server_env",
        f"grep -h '^SERVICE_TOKEN=' {DEPLOY}/.env {DEPLOY}/apps/control-server/.env 2>/dev/null | wc -l",
        "pm2 env zhubo-control-center 2>/dev/null | grep -c SERVICE_TOKEN || true",
        "curl -sf http://127.0.0.1:4790/api/health",
    ]
    for cmd in cmds:
        _, o, e = c.exec_command(cmd, timeout=20)
        out = o.read().decode("utf-8", errors="replace").strip()
        err = e.read().decode("utf-8", errors="replace").strip()
        print(f">>> {cmd[:80]}")
        if out:
            print(out)
        if err:
            print("err:", err[:200])
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
