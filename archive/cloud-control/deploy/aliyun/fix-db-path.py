#!/usr/bin/env python3
"""fix：将 DATABASE_URL 与 prod.db 统一到 apps/control-server/prod.db（需 --execute）。"""
from ops_config import CONTROL_DB, CONTROL_PM2, CONTROL_ROOT, CONTROL_SERVER_DIR, LEGACY_DB
from ops_lib import parse_fix_args, run_fix_cmds, run_ssh, ssh_session

DEPLOY = CONTROL_ROOT


def main() -> None:
    execute = parse_fix_args("统一生产库路径到 apps/control-server/prod.db")
    planned_shell = f"""
set -e
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=file:{CONTROL_DB}|' {DEPLOY}/.env
# 若旧路径有数据且正式库为空，从旧路径迁移（一次性）
if [ -f "{LEGACY_DB}" ] && [ -f "{CONTROL_DB}" ]; then
  n=$(sqlite3 "{LEGACY_DB}" "select count(*) from SecretStore;" 2>/dev/null || echo 0)
  c=$(sqlite3 "{CONTROL_DB}" "select count(*) from SecretStore;" 2>/dev/null || echo 0)
  if [ "$n" -gt "$c" ] 2>/dev/null; then
    cp "{LEGACY_DB}" "{CONTROL_DB}"
    echo "已从旧路径迁移 SecretStore 数据"
  fi
fi
sqlite3 "{CONTROL_DB}" "select count(*) from User;"
sqlite3 "{CONTROL_DB}" "select count(*) from SecretStore;"
grep DATABASE_URL {DEPLOY}/.env
echo "注意：本脚本不自动 pm2 restart {CONTROL_PM2}，请评估后手动重启。"
"""
    print("计划：")
    print(f"  1. 更新 {DEPLOY}/.env DATABASE_URL -> file:{CONTROL_DB}")
    print(f"  2. 必要时从旧路径 {LEGACY_DB} 迁移")
    print(f"  3. 不重启 nginx / x-ui / {CONTROL_PM2}（需手动）")
    steps = [("统一 DB 路径", planned_shell)]
    run_fix_cmds(steps, execute=execute, timeout=120)
    if execute:
        with ssh_session() as client:
            run_ssh(client, f"ls -la {CONTROL_DB} {LEGACY_DB} 2>&1", timeout=15)


if __name__ == "__main__":
    main()
