#!/usr/bin/env python3
"""只读：列出正式库 SecretStore（不含旧路径）。"""
from ops_config import CONTROL_DB
from ops_lib import run_check_cmds

run_check_cmds(
    [
        f'sqlite3 "{CONTROL_DB}" "select shopName, keyName, valuePreview from SecretStore;"',
    ],
    timeout=20,
)
