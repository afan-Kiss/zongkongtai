#!/usr/bin/env python3
"""fix：恢复生产库文件权限（需 --execute；不 reload nginx）。"""
from ops_config import CONTROL_DB, CONTROL_PM2, CONTROL_ROOT, CONTROL_SERVER_DIR
from ops_lib import parse_fix_args, run_fix_cmds

REMOTE = f"""
set -e
DEPLOY={CONTROL_ROOT}
DB={CONTROL_DB}
SERVER_DIR={CONTROL_SERVER_DIR}

echo "=== stop {CONTROL_PM2} ==="
pm2 stop {CONTROL_PM2} || true
sleep 2

echo "=== fix db perms ==="
chmod 775 "$SERVER_DIR"
chmod 664 "$DB"
chown -R root:root "$SERVER_DIR"
rm -f "$DB-wal" "$DB-shm" 2>/dev/null || true
sqlite3 "$DB" "PRAGMA integrity_check;" | head -1

echo "=== start {CONTROL_PM2} ==="
cd "$DEPLOY"
pm2 start ecosystem.config.cjs --only {CONTROL_PM2} --update-env
sleep 4
curl -sf --max-time 8 http://127.0.0.1:4790/api/health; echo
"""


def main() -> None:
    execute = parse_fix_args("恢复 DB 权限并重启 control-center（不 reload nginx）")
    print("本脚本不会修改 nginx 配置或 reload nginx。")
    run_fix_cmds([("recover upload/db", REMOTE)], execute=execute, timeout=120)


if __name__ == "__main__":
    main()
