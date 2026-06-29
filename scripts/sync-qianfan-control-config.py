"""Sync qianfan bot local config with control center settings (gitignored files only)."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

import paramiko

CONTROL_ROOT = Path(__file__).resolve().parents[1]
BOT_ROOT = Path(r"E:\我的软件源码\千帆中转机器人")
DEPLOY = "/www/wwwroot/zhubo-control-center"


def load_all() -> None:
    spec = importlib.util.spec_from_file_location(
        "load_deploy_env", CONTROL_ROOT / "scripts" / "load-deploy-env.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.load_all()


def fetch_remote_token() -> str:
    pwd = os.environ.get("SSH_PASS", "")
    if not pwd:
        return ""
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=pwd, timeout=15)
    _, o, _ = c.exec_command(f"grep '^SERVICE_TOKEN=' {DEPLOY}/.env | head -1", timeout=15)
    line = o.read().decode("utf-8", errors="replace").strip()
    c.close()
    if "=" in line:
        return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def ensure_qianfan_shops() -> bool:
    dst = BOT_ROOT / "config" / "qianfan-shops.json"
    src = BOT_ROOT / "config" / "qianfan-shops.example.json"
    if dst.exists():
        return True
    if not src.exists():
        return False
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return True


def ensure_bot_config(service_token: str) -> None:
    cfg_path = BOT_ROOT / "config.wxbot-new.json"
    example_path = BOT_ROOT / "config.wxbot-new.example.json"
    if cfg_path.exists():
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    elif example_path.exists():
        cfg = json.loads(example_path.read_text(encoding="utf-8"))
    else:
        cfg = {}
    cc = cfg.get("controlCenter") or {}
    cc.update(
        {
            "enabled": True,
            "serverUrl": "http://8.137.126.18/control",
            "serviceToken": service_token,
            "collectorMachine": cc.get("collectorMachine") or "培育钻石",
            "collectorProject": cc.get("collectorProject") or "千帆中转机器人",
            "uploadIntervalMinutes": cc.get("uploadIntervalMinutes") or 10,
        }
    )
    cfg["controlCenter"] = cc
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync_local_control_env(service_token: str) -> None:
    env_path = CONTROL_ROOT / ".env"
    lines = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    out = []
    replaced = False
    for line in lines:
        if line.strip().startswith("SERVICE_TOKEN="):
            out.append(f"SERVICE_TOKEN={service_token}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        if out and out[-1].strip():
            out.append("")
        out.append(f"SERVICE_TOKEN={service_token}")
    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")


def main() -> int:
    load_all()
    token = fetch_remote_token()
    if not token:
        print("no_remote_token")
        return 1
    ensure_bot_config(token)
    sync_local_control_env(token)
    shops_ok = ensure_qianfan_shops()
    print("bot_config_written=yes")
    print("local_service_token_synced=yes")
    print("qianfan_shops_ready=", shops_ok)
    return 0


if __name__ == "__main__":
    sys.exit(main())
