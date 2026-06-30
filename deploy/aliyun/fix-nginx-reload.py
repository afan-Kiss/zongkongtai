#!/usr/bin/env python3
"""只读：检查 aa_nginx 状态（不 reload / 不 restart nginx）。"""
from ops_lib import parse_fix_args, run_check_cmds

print("说明：本脚本仅只读检查 nginx 状态，不会 reload 或 restart nginx。")
parse_fix_args("（兼容参数）nginx 状态只读检查")  # 消耗 argv，保持 fix 脚本接口一致

run_check_cmds(
    [
        "systemctl status aa_nginx --no-pager | head -25",
        "ss -lntp | grep -E '4880|4790|aa_nginx'",
        "curl -sf http://127.0.0.1:4880/api/health || echo analysis_health_fail",
        "curl -sf http://127.0.0.1:4790/api/health || echo control_health_fail",
    ],
    timeout=60,
)
