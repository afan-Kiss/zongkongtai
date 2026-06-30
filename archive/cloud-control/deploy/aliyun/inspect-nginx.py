import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "pm2 status",
    "ss -lntp | grep -E '4790|4880|nginx'",
    "cat /etc/nginx/conf.d/zhubo-control-center.conf 2>/dev/null || echo NO_CONF",
    "nginx -t 2>&1",
    "curl -v --max-time 5 http://127.0.0.1:4880/api/health 2>&1 | tail -20",
    "iptables -L INPUT -n 2>/dev/null | head -20 || true",
    "firewall-cmd --list-ports 2>/dev/null || true",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR:", err.rstrip())
c.close()
