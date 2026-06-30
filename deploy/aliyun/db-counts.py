#!/usr/bin/env python3
"""只读：生产库各表行数。"""
from ops_config import CONTROL_DB
from ops_lib import run_check_cmds

queries = [
    "select count(*) from User;",
    "select count(*) from SecretStore;",
    "select count(*) from Agent;",
    "select username from User;",
]
run_check_cmds([f'sqlite3 "{CONTROL_DB}" "{q}"' for q in queries], timeout=15)
