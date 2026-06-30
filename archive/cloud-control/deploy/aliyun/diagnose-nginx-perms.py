#!/usr/bin/env python3
"""只读：检查 nginx 上传目录权限与 nginx 用户写测试。"""
from ops_config import NGINX_CLIENT_BODY, NGINX_TMP_DIR
from ops_lib import run_check_cmds

run_check_cmds(
    [
        f"ls -la {NGINX_TMP_DIR}/ {NGINX_TMP_DIR}/tmp/ {NGINX_CLIENT_BODY}/",
        f"namei -l {NGINX_CLIENT_BODY}/",
        "getenforce 2>/dev/null || echo no-selinux",
        f"runuser -u nginx -- touch {NGINX_CLIENT_BODY}/test-write-readonly 2>&1 && echo touch-ok || echo touch-fail",
        "grep client_body /etc/aa_nginx/conf.d/zhubo-analysis.conf 2>/dev/null || true",
    ],
    timeout=30,
)
