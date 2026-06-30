#!/usr/bin/env python3
"""只读：检查生产库表结构与 ecosystem 配置。"""
from ops_config import CONTROL_DB, CONTROL_ROOT
from ops_lib import run_check_cmds

run_check_cmds(
    [
        f"grep DATABASE_URL {CONTROL_ROOT}/.env {CONTROL_ROOT}/apps/control-server/.env 2>/dev/null",
        f"ls -la {CONTROL_DB} 2>&1",
        f'echo "=== 正式库 {CONTROL_DB} ===" && sqlite3 "{CONTROL_DB}" "select name from sqlite_master where type=\'table\' order by name;" 2>&1',
        f'sqlite3 "{CONTROL_DB}" "select \'SecretStore\', count(*) from SecretStore union all select \'Project\', count(*) from Project union all select \'Agent\', count(*) from Agent;" 2>&1',
        f"head -40 {CONTROL_ROOT}/ecosystem.config.cjs",
    ],
    timeout=30,
)
