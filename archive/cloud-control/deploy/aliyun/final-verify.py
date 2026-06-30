import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")
PUBLIC_HEALTH = f"http://{HOST}/control/api/health"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASSWORD, timeout=60)

cmds = [
    f"curl -sf http://127.0.0.1:4790/api/health",
    f"curl -sf --max-time 10 {PUBLIC_HEALTH}",
    "systemctl reset-failed aa_nginx 2>/dev/null || true",
    "pm2 status | grep control",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
c.close()
