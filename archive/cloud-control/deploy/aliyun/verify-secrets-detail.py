#!/usr/bin/env python3
"""只读：千帆 SecretStore 详情与最近操作日志。"""
import sys

from ops_config import CONTROL_DB
from ops_lib import run_ssh, ssh_session

with ssh_session() as client:
    run_ssh(
        client,
        f'sqlite3 "{CONTROL_DB}" "select shopName, substr(cookieHash,1,8), valuePreview, datetime(updatedAt/1000,\'unixepoch\') as updatedAt from SecretStore where platform=\'qianfan\' and archived=0 order by shopName;"',
        timeout=15,
    )
    run_ssh(
        client,
        f'sqlite3 "{CONTROL_DB}" "select action, datetime(createdAt/1000,\'unixepoch\'), substr(detail,1,80) from OperationLog where action in (\'qianfan_cookie_upload\',\'secret_resolve\') order by createdAt desc limit 12;"',
        timeout=15,
    )
