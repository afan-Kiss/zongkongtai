"""PM2 status summary (ASCII)."""
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


def main() -> int:
    load_all()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=os.environ["SSH_PASS"], timeout=15)
    _, o, _ = c.exec_command("pm2 jlist", timeout=30)
    apps = json.loads(o.read().decode("utf-8", errors="replace"))
    for name in ["zhubo-control-center", "zhubo-analysis", "nginx"]:
        for app in apps:
            if app.get("name") == name:
                env = app.get("pm2_env", {})
                print(f"{name}: status={env.get('status')} restarts={env.get('restart_time')} uptime_ms={app.get('pm_uptime')}")
    _, o2, _ = c.exec_command(
        "curl -s http://127.0.0.1:4790/api/health; echo; curl -s -o /dev/null -w public=%{http_code} http://8.137.126.18/control/api/health; echo",
        timeout=20,
    )
    print(o2.read().decode("ascii", errors="replace").strip())
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
