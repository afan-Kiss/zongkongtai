#!/usr/bin/env python3
"""fix：修复生产库 SQLite 文件权限（不重启 nginx / x-ui / zhubo-analysis）。"""
from ops_config import CONTROL_DB, CONTROL_PM2, CONTROL_ROOT, CONTROL_SERVER_DIR
from ops_lib import parse_fix_args, run_fix_cmds, run_ssh, ssh_session

DB = CONTROL_DB
SERVER_DIR = CONTROL_SERVER_DIR


def main() -> None:
    execute = parse_fix_args("修复 control-server 生产库文件权限")
    inspect = [
        f"ls -la {SERVER_DIR}/",
        f"grep DATABASE_URL {CONTROL_ROOT}/.env",
        f'sqlite3 "{DB}" "BEGIN; SELECT 1; ROLLBACK;" && echo SQLITE_OK || echo SQLITE_FAIL',
    ]
    planned = [
        f"chmod 775 {SERVER_DIR}",
        f"chmod 664 {DB}",
        f"chown -R root:root {SERVER_DIR}",
        f"rm -f {DB}-wal {DB}-shm 2>/dev/null || true",
    ]
    print("\n=== 当前状态 ===")
    with ssh_session() as client:
        for cmd in inspect:
            run_ssh(client, cmd, timeout=20)
    print("\n=== 计划修复 ===")
    for cmd in planned:
        print(f"  {cmd}")
    print("注意：不会重启 nginx / x-ui / zhubo-analysis。")
    print(f"可选（本脚本不含）：pm2 restart {CONTROL_PM2} — 需单独评估后再执行。")
    steps = [(c, c) for c in planned]
    run_fix_cmds(steps, execute=execute, timeout=30)
    if execute:
        print("\n=== 修复后 ===")
        with ssh_session() as client:
            run_ssh(client, f"ls -la {DB}", timeout=15)


if __name__ == "__main__":
    main()
