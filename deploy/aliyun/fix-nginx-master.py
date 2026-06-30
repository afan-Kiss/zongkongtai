#!/usr/bin/env python3
"""只读：检查 aa_nginx master/worker 与 4880 健康（不 kill / 不 HUP）。"""
from ops_lib import parse_fix_args, run_check_cmds

print("说明：本脚本仅只读诊断，不会 kill 或 HUP nginx。")
parse_fix_args("（兼容参数）nginx master 只读检查")

run_check_cmds(
    [
        "cat /etc/systemd/system/aa_nginx.service",
        "ls -la /var/run/nginx.pid /run/nginx.pid /etc/aa_nginx/logs/nginx.pid 2>/dev/null",
        "curl -v http://127.0.0.1:4880/api/health 2>&1 | tail -25",
        "ss -lntp | grep -E '4880|80' || echo no_listeners",
    ],
    timeout=60,
)
