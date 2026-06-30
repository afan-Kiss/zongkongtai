#!/usr/bin/env python3
"""只读：快速检查服务器健康与千帆 SecretStore。"""
from ops_config import CONTROL_DB
from ops_lib import run_check_cmds

run_check_cmds(
    [
        "tail -20 /www/wwwroot/zhubo-control-center/logs/pm2-error.log",
        f'sqlite3 "{CONTROL_DB}" "select shopName, substr(cookieHash,1,8), datetime(updatedAt/1000,\'unixepoch\') from SecretStore where platform=\'qianfan\';"',
    ],
    timeout=30,
)
