import os
import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")
PUBLIC_HEALTH = f"http://{HOST}/control/api/health"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASSWORD, timeout=60)

cmds = [
    "curl -sf http://127.0.0.1:4790/api/health",
    f"curl -sf --max-time 10 {PUBLIC_HEALTH} || echo PUBLIC_FAIL",
    "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh && pm2 status",
    "grep -q ADMIN_PASSWORD /www/wwwroot/zhubo-control-center/.env && echo ADMIN_PASSWORD=set",
    "grep -q AGENT_TOKEN /www/wwwroot/zhubo-control-center/.env && echo AGENT_TOKEN=set",
    "grep -q SERVICE_TOKEN /www/wwwroot/zhubo-control-center/.env && echo SERVICE_TOKEN=set",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("ERR:", err.rstrip())

c.close()
