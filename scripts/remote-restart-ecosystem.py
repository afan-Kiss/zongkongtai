"""Upload ecosystem.config.cjs and restart PM2 only."""
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
    sftp = c.open_sftp()
    sftp.put(str(ROOT / "ecosystem.config.cjs"), f"{DEPLOY}/ecosystem.config.cjs")
    sftp.close()
    cmd = f"cd {DEPLOY} && pm2 delete zhubo-control-center 2>/dev/null; pm2 start ecosystem.config.cjs && sleep 4 && curl -s http://127.0.0.1:4790/api/health"
    _, o, e = c.exec_command(cmd, timeout=120)
    out = o.read().decode("ascii", errors="replace")
    err = e.read().decode("ascii", errors="replace")
    print(out.strip()[:500])
    if err.strip():
        print("ERR", err[:300])
    _, o2, _ = c.exec_command(
        "pm2 jlist | python3 -c \"import sys,json; a=json.load(sys.stdin); print([x['name']+':'+x['pm2_env']['status'] for x in a if x['name']=='zhubo-control-center'])\"",
        timeout=30,
    )
    print(o2.read().decode("ascii", errors="replace").strip())
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
