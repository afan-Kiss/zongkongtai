import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "cat /etc/systemd/system/aa_nginx.service",
    "ls -la /var/run/nginx.pid /run/nginx.pid /etc/aa_nginx/logs/nginx.pid 2>/dev/null",
    "curl -v http://127.0.0.1:4880/api/health 2>&1 | tail -25",
    "kill 257754 2>/dev/null; sleep 1; ss -lntp | grep 4880 || echo no4880",
    "kill -HUP 78499; sleep 1; ss -lntp | grep -E '4880|80'",
    "curl -sf http://127.0.0.1:4880/api/health || curl -v http://127.0.0.1:4880/api/health 2>&1 | tail -15",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR:", err.rstrip())
c.close()
