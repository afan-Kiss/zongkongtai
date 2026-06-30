#!/usr/bin/env python3
"""只读：检查是否存在嵌套 prisma/prisma/prod.db 旧路径。"""
from ops_config import CONTROL_DB, LEGACY_DB
from ops_lib import run_check_cmds

NESTED = f"{LEGACY_DB.rsplit('/', 1)[0]}/prisma/prod.db"
print("说明：嵌套路径仅用于排查历史误配置，正式库为 apps/control-server/prod.db\n")

run_check_cmds(
    [
        f"ls -la {NESTED} {LEGACY_DB} {CONTROL_DB} 2>&1",
        f'for f in "{NESTED}" "{LEGACY_DB}" "{CONTROL_DB}"; do [ -f "$f" ] && echo "=== $f ===" && sqlite3 "$f" "select count(*) from User; select count(*) from SecretStore;" 2>&1; done',
        f"grep DATABASE_URL /www/wwwroot/zhubo-control-center/.env",
    ],
    timeout=30,
)
