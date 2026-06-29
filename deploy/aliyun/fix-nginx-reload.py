import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "systemctl status aa_nginx --no-pager | head -25",
    "ss -lntp | grep -E '4880|4790|aa_nginx'",
    "/usr/sbin/aa_nginx -s reload 2>&1",
    "sleep 1; ss -lntp | grep 4880",
    "curl -sf http://127.0.0.1:4880/api/health",
    "curl -sf http://127.0.0.1:4790/api/health",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR:", err.rstrip())
c.close()
