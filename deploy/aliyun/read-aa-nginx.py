import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "cat /etc/aa_nginx/aa_nginx.conf",
    "ls /etc/aa_nginx/conf.d/ 2>/dev/null",
    "ls /etc/aa_nginx/vhost/ 2>/dev/null",
    "grep -r include /etc/aa_nginx/aa_nginx.conf",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace")[:8000])
c.close()
