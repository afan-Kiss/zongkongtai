#!/usr/bin/env python3
"""只读：检查 OperationLog 与 User 表。"""
from ops_config import CONTROL_DB
from ops_lib import run_check_cmds

run_check_cmds(
    [
        f'sqlite3 "{CONTROL_DB}" ".schema OperationLog"',
        f'sqlite3 "{CONTROL_DB}" "select action, count(*) from OperationLog group by action order by count(*) desc limit 20;"',
        f'sqlite3 "{CONTROL_DB}" "select action, datetime(createdAt/1000,\'unixepoch\'), detail from OperationLog order by createdAt desc limit 15;"',
        f'sqlite3 "{CONTROL_DB}" "select username from User;"',
    ],
    timeout=30,
)
