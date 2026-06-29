import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "curl -sf http://127.0.0.1:4880/api/health",
    "curl -sf --max-time 10 http://8.137.126.18:4880/api/health",
    "systemctl reset-failed aa_nginx 2>/dev/null || true",
    "pm2 status | grep control",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
c.close()
