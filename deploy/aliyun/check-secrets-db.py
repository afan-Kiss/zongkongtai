#!/usr/bin/env python3
"""只读：检查生产库 SecretStore（千帆 Cookie 等）。"""
from ops_config import CONTROL_DB, CONTROL_SERVER_DIR
from ops_lib import run_check_cmds

run_check_cmds(
    [
        f"ls -la {CONTROL_SERVER_DIR}/",
        "curl -sf --max-time 5 http://127.0.0.1:4790/api/health; echo",
        f'sqlite3 "{CONTROL_DB}" "select shopName, substr(cookieHash,1,8), updatedAt from SecretStore where platform=\'qianfan\' order by updatedAt desc limit 10;"',
    ],
    timeout=30,
)
