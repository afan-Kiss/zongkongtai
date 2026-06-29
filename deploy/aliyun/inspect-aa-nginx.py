import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

cmds = [
    "readlink -f /proc/78499/exe 2>/dev/null || readlink -f /proc/79567/exe",
    "tr '\\0' ' ' < /proc/78499/cmdline; echo",
    "find /www -name aa_nginx 2>/dev/null | head",
    "find /etc -name '*nginx*' 2>/dev/null | head -20",
    "grep -r '4723' /www 2>/dev/null | head -10",
    "curl -sI http://127.0.0.1/api/health | head -10",
]

for cmd in cmds:
    print("\n>>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8", errors="replace")[:3000])
c.close()
