#!/usr/bin/env python3
"""fix：写入 zhubo-analysis nginx 配置（需 --execute；不 reload/restart nginx）。"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ops_lib import parse_fix_args, run_fix_cmds, run_ssh, ssh_session

FIXED = r"""# zhubo-analysis + control-center reverse proxy

server {
    listen 80;
    server_name 8.137.126.18;

    client_max_body_size 20m;

    location = /api/health {
        proxy_pass http://127.0.0.1:4723;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /control/ {
        proxy_pass http://127.0.0.1:4790/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:4723;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    access_log /www/wwwlogs/zhubo-analysis.access.log;
    error_log /www/wwwlogs/zhubo-analysis.error.log;
}
"""


def main() -> None:
    execute = parse_fix_args("写入 nginx 分析站配置（不 reload nginx）")
    print("策略：即使 --execute 也仅写入配置文件，不会 reload/restart nginx。")
    write_cmd = (
        "cat > /etc/aa_nginx/conf.d/zhubo-analysis.conf << 'NGXEOF'\n"
        + FIXED
        + "\nNGXEOF\n/usr/sbin/aa_nginx -t"
    )
    run_fix_cmds([("write nginx conf", write_cmd)], execute=execute, timeout=60)
    if execute:
        with ssh_session() as client:
            run_ssh(client, "head -5 /etc/aa_nginx/conf.d/zhubo-analysis.conf", timeout=15)


if __name__ == "__main__":
    pwd = os.environ.get("SSH_PASS", "")
    if not pwd:
        from ops_lib import load_ssh_password

        load_ssh_password()
    main()
