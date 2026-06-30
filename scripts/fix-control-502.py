#!/usr/bin/env python3
"""fix：诊断 control 502 并按需重启 PM2（默认 dry-run）。"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = "/www/wwwroot/zhubo-control-center"
sys.path.insert(0, str(ROOT / "deploy" / "aliyun"))
from ops_lib import parse_fix_args  # noqa: E402


def load_all() -> None:
    spec = importlib.util.spec_from_file_location(
        "load_deploy_env", ROOT / "scripts" / "load-deploy-env.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.load_all()


def run(c, cmd: str) -> str:
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    print(f">>> {cmd[:100]}")
    if out.strip():
        print(out.rstrip()[:2000])
    if err.strip():
        print("ERR:", err.rstrip()[:500])
    return out


def main() -> int:
    execute = parse_fix_args("诊断 control 502 并按需 pm2 restart control-center")
    load_all()
    pwd = os.environ.get("SSH_PASS", "")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=pwd, timeout=15)

    run(c, "pm2 list")
    run(c, "curl -sf http://127.0.0.1:4790/api/health || echo health_fail")
    run(c, "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1/control/api/health || true")
    run(c, "pm2 logs zhubo-control-center --lines 15 --nostream 2>/dev/null | tail -20")

    restart_cmd = (
        f"cd {DEPLOY} && set -a && source .env && set +a && "
        "pm2 restart zhubo-control-center --update-env && sleep 3 && "
        "curl -sf http://127.0.0.1:4790/api/health"
    )
    print("\n计划（需 --execute）：", restart_cmd[:120], "…")
    if execute:
        run(c, restart_cmd)
        run(c, "curl -sf -o /dev/null -w 'public_health=%{http_code}' http://127.0.0.1/control/api/health; echo")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
