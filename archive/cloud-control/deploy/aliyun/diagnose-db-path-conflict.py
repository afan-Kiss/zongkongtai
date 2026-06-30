#!/usr/bin/env python3
"""排查新旧 DB 路径冲突 — 旧路径 prisma/prod.db 仅用于排查，不是正式库。"""
from ops_config import CONTROL_DB, LEGACY_DB
from ops_lib import run_check_cmds

print("说明：正式生产库路径为 apps/control-server/prod.db")
print("旧路径 apps/control-server/prisma/prod.db 仅用于排查，不是正式库\n")

run_check_cmds(
    [
        f"grep DATABASE_URL {CONTROL_DB.rsplit('/', 1)[0].replace('/apps/control-server', '')}/.env 2>/dev/null || grep DATABASE_URL /www/wwwroot/zhubo-control-center/.env",
        f"ls -la {CONTROL_DB} {LEGACY_DB} 2>&1",
        f'echo "=== 正式库 {CONTROL_DB} ===" && sqlite3 "{CONTROL_DB}" "select name from sqlite_master where type=\'table\' order by name;" 2>&1',
        f'echo "=== 旧路径（排查用） {LEGACY_DB} ===" && sqlite3 "{LEGACY_DB}" "select name from sqlite_master where type=\'table\' order by name;" 2>&1',
        f'for f in "{CONTROL_DB}" "{LEGACY_DB}"; do echo "=== counts $f ==="; sqlite3 "$f" "select \'SecretStore\', count(*) from SecretStore union all select \'Project\', count(*) from Project;" 2>&1; done',
    ],
    timeout=30,
)
