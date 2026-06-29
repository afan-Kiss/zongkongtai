import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "/usr/sbin/aa_nginx -T 2>&1 | grep -n 4880 || echo NO4880",
    "ps aux | grep aa_nginx | grep -v grep",
    "kill -HUP 78499 2>&1; sleep 2; ss -lntp | grep 4880 || echo no4880",
    "curl -sf http://127.0.0.1:4790/api/health",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
c.close()
