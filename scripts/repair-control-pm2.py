"""Restart zhubo-control-center and verify port 4790 (ASCII logs)."""
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


def run(c, cmd: str, timeout: int = 120) -> str:
    _, o, e = c.exec_command(cmd, timeout=timeout)
    return o.read().decode("ascii", errors="replace") + e.read().decode("ascii", errors="replace")


def main() -> int:
    load_all()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=os.environ["SSH_PASS"], timeout=15)

    jlist = run(c, "pm2 jlist")
    try:
        apps = json.loads(jlist.strip().split("\n")[0] if "\n" in jlist else jlist)
        for app in apps:
            if app.get("name") == "zhubo-control-center":
                env = app.get("pm2_env", {})
                print(
                    "before_status=%s restarts=%s exit_code=%s"
                    % (env.get("status"), env.get("restart_time"), env.get("exit_code"))
                )
    except Exception as ex:
        print("jlist_parse_fail", ex)

    script = f"""
set -e
cd {DEPLOY}
set -a
source .env
set +a
cd apps/control-server
export DATABASE_URL="${{DATABASE_URL:-file:./prisma/prod.db}}"
npx prisma db push --accept-data-loss
npx prisma generate
cd {DEPLOY}
pm2 delete zhubo-control-center 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
sleep 4
curl -s http://127.0.0.1:4790/api/health || echo health_fail
"""
    out = run(c, script, timeout=180)
    safe = "".join(ch if ord(ch) < 128 else "?" for ch in out)
    print("restart_output:", safe[-1500:])

    code = run(c, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4790/api/health")
    print("local4790_code=", code.strip())
    code2 = run(c, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/control/api/health")
    print("public_api_code=", code2.strip())

    err = run(c, "tail -25 /root/.pm2/logs/zhubo-control-center-error.log 2>/dev/null")
    print("error_log:", "".join(ch if ord(ch) < 128 else "?" for ch in err)[-1200:])

    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
