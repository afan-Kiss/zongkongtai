import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "which node; which npm; which pm2",
    "node -v 2>/dev/null || true",
    "pm2 -v 2>/dev/null || true",
    "ls -la /www/wwwroot/zhubo-control-center | head",
    "ls -la /www/wwwroot/zhubo-control-center/apps/control-server/dist 2>/dev/null | head",
    "test -f /www/wwwroot/zhubo-control-center/apps/control-web/dist/index.html && echo WEB_OK || echo WEB_MISSING",
    "ls /etc/nginx/conf.d/ | grep control || echo NO_NGINX",
    "ss -lntp | grep -E '4790|4880' || true",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR:", err.rstrip())
c.close()
