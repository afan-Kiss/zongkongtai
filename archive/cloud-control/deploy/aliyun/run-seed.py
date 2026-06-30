#!/usr/bin/env python3
"""fix：运行 seed（需 --execute；会 pm2 restart control-center，不碰 nginx/x-ui/analysis）。"""
from ops_config import CONTROL_DB, CONTROL_PM2, CONTROL_ROOT
from ops_lib import parse_fix_args, run_fix_cmds

CMD = f"""
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
cd {CONTROL_ROOT}/apps/control-server
export ADMIN_USERNAME=$(grep ^ADMIN_USERNAME= ../../.env | cut -d= -f2-)
export ADMIN_PASSWORD=$(grep ^ADMIN_PASSWORD= ../../.env | cut -d= -f2-)
export DATABASE_URL=file:{CONTROL_DB}
npx tsx prisma/seed.ts 2>&1
sqlite3 "{CONTROL_DB}" "select count(*) from User;"
cd {CONTROL_ROOT}
pm2 restart {CONTROL_PM2}
sleep 2
curl -sf http://8.137.126.18/control/api/health
"""


def main() -> None:
    execute = parse_fix_args(f"运行 prisma seed 并重启 {CONTROL_PM2}")
    print("不会重置 ADMIN_PASSWORD / Cookie / Token。")
    run_fix_cmds([("run seed", CMD)], execute=execute, timeout=180)


if __name__ == "__main__":
    main()
