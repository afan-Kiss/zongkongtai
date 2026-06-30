#!/usr/bin/env python3
"""只读：检查 prod.db 是否被其他进程占用。"""
from ops_config import CONTROL_DB
from ops_lib import run_check_cmds

run_check_cmds(
    [
        f"lsof {CONTROL_DB} 2>/dev/null | head -10 || fuser -v {CONTROL_DB} 2>&1 | head -5",
        f"ls -la {CONTROL_DB}* 2>/dev/null",
    ],
    timeout=30,
)
