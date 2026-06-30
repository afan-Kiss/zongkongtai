#!/usr/bin/env python3
"""只读：检查服务器 PM2、生产库与公网健康。"""
from ops_config import CONTROL_DB, CONTROL_ENTRY
from ops_lib import run_check_cmds

run_check_cmds(
    [
        "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 status",
        f"ls -la {CONTROL_DB} 2>/dev/null || echo NO_DB",
        "ls -la /tmp/control-prod-db-backup*.db 2>/dev/null | tail -3 || echo NO_BAK",
        f"curl -sf --max-time 5 {CONTROL_ENTRY}api/health || echo HEALTH_FAIL",
        f'sqlite3 "{CONTROL_DB}" "select count(*) from SecretStore;" 2>/dev/null || echo SECRET_COUNT_FAIL',
    ],
    timeout=30,
)
