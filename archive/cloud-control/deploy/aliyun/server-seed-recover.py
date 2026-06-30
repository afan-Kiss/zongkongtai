#!/usr/bin/env python3
"""fix：从 .env 导出变量并运行 seed（需 --execute）。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ops_config import CONTROL_DB, CONTROL_PM2, CONTROL_ROOT
from ops_lib import parse_fix_args, run_fix_cmds, run_ssh, ssh_session


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main() -> None:
    execute = parse_fix_args("server seed recover")
    with ssh_session() as client:
        _, o, _ = client.exec_command(f"cat {CONTROL_ROOT}/.env", timeout=30)
        env = parse_env(o.read().decode("utf-8", errors="replace"))
    exports = " ".join(
        f'export {k}="{v.replace(chr(34), chr(92)+chr(34))}"'
        for k, v in env.items()
        if k.isidentifier() or k.replace("_", "").isalnum()
    )
    cmd = f"""
set -e
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
{exports}
cd {CONTROL_ROOT}/apps/control-server
export DATABASE_URL="file:{CONTROL_DB}"
npx tsx prisma/seed.ts
cd {CONTROL_ROOT}
pm2 restart {CONTROL_PM2}
sleep 2
sqlite3 "{CONTROL_DB}" "select count(*) from User;"
"""
    run_fix_cmds([("seed recover", cmd)], execute=execute, timeout=180)


if __name__ == "__main__":
    main()
