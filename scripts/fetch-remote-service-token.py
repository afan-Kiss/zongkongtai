"""Read remote SERVICE_TOKEN from server env file (stdout token only for piping)."""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
DEPLOY_DIR = "/www/wwwroot/zhubo-control-center"


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
    pwd = os.environ.get("SSH_PASS", "")
    if not pwd:
        print("no_ssh", file=sys.stderr)
        return 1
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=pwd, timeout=15)
    for path in [
        f"{DEPLOY_DIR}/.env",
        f"{DEPLOY_DIR}/apps/control-server/.env",
    ]:
        _, o, _ = c.exec_command(f"test -f {path} && cat {path} || true", timeout=20)
        token = parse_token(o.read().decode("utf-8", errors="replace"))
        if token:
            print(token)
            c.close()
            return 0
    # fallback: pm2 env
    _, o, _ = c.exec_command("pm2 env zhubo-control-center 2>/dev/null | grep '^SERVICE_TOKEN=' || true", timeout=20)
    token = parse_token(o.read().decode("utf-8", errors="replace"))
    c.close()
    if token:
        print(token)
        return 0
    print("not_found", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
