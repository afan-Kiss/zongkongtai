import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)
_, o, _ = c.exec_command("cat /etc/aa_nginx/conf.d/zhubo-analysis.conf", timeout=60)
print(o.read().decode("utf-8", errors="replace"))
c.close()
