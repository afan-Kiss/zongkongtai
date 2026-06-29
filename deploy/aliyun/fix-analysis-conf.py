import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
FIXED = r"""# zhubo-analysis + control-center reverse proxy

server {
    listen 80;
    server_name 8.137.126.18 xiangyuzhubao.xyz www.xiangyuzhubao.xyz;

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

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)
c.exec_command("cat > /etc/aa_nginx/conf.d/zhubo-analysis.conf << 'NGXEOF'\n" + FIXED + "\nNGXEOF")
cmds = [
    "/usr/sbin/aa_nginx -t",
    "master_pid=$(ps aux | awk '/nginx: master process \\/usr\\/sbin\\/aa_nginx/ && !/grep/ {print $2; exit}'); kill -HUP $master_pid",
    "curl -sf http://127.0.0.1/control/api/health",
    "curl -sf http://127.0.0.1/api/health",
]
for cmd in cmds:
    print(">>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR:", err.rstrip())
c.close()
