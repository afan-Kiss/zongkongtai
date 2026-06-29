"""Ensure PM2 zhubo-control-center loads root .env and restart only that app."""
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


def run(client, cmd: str) -> None:
    print(f">>> {cmd[:120]}")
    _, o, e = client.exec_command(cmd, timeout=120)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())


def main() -> int:
    load_all()
    pwd = os.environ.get("SSH_PASS", "")
    if not pwd:
        print("no_ssh", file=sys.stderr)
        return 1
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=pwd, timeout=15)

    # Load .env into current shell and restart PM2 with updated env
    run(
        c,
        f"""
set -a
source {DEPLOY}/.env
set +a
cd {DEPLOY}
pm2 restart zhubo-control-center --update-env
sleep 2
curl -sf http://127.0.0.1:4790/api/health
""",
    )
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
