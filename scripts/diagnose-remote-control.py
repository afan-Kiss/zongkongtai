"""Diagnose control center on remote (ASCII output only)."""
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
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=os.environ["SSH_PASS"], timeout=15)
    cmds = [
        "pm2 jlist",
        "ss -lntp 2>/dev/null | grep 4790 || true",
        "curl -s -o /dev/null -w 'local4790=%{http_code}' http://127.0.0.1:4790/api/health; echo",
        "curl -s -o /dev/null -w 'public=%{http_code}' http://127.0.0.1/control/api/health; echo",
        "tail -20 /root/.pm2/logs/zhubo-control-center-error.log 2>/dev/null || true",
    ]
    for cmd in cmds:
        _, o, e = c.exec_command(cmd, timeout=90)
        out = o.read().decode("ascii", errors="replace").strip()
        err = e.read().decode("ascii", errors="replace").strip()
        print("CMD:", cmd[:70])
        if out:
            print(out[:2500])
        if err:
            print("ERR:", err[:400])
        print("---")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
