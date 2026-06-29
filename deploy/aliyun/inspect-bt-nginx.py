import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "ls /www/server/nginx/sbin/nginx 2>/dev/null; ls /usr/local/nginx/sbin/nginx 2>/dev/null",
    "find /www/server/nginx -name '*.conf' 2>/dev/null | head -20",
    "grep -r '4723' /www/server/panel/vhost/nginx/ 2>/dev/null | head -5",
    "ls /www/server/panel/vhost/nginx/ 2>/dev/null | head -20",
    "cat /www/server/panel/vhost/nginx/zhubo-analysis.conf 2>/dev/null | head -40 || ls /www/server/panel/vhost/nginx/*.conf | head -5",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
c.close()
