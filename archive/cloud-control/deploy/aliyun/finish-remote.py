import os
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = os.environ.get("SSH_PASS", "")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

script = (ROOT / "deploy/aliyun/finish-deploy.sh").read_text(encoding="utf-8").replace("\r\n", "\n")
c.exec_command("cat > /tmp/finish-control-deploy.sh << 'EOF'\n" + script + "\nEOF\nchmod +x /tmp/finish-control-deploy.sh")
_, o, e = c.exec_command("bash /tmp/finish-control-deploy.sh", timeout=600)
out = o.read().decode("utf-8", errors="replace")
err = e.read().decode("utf-8", errors="replace")
code = o.channel.recv_exit_status()
enc = getattr(__import__("sys").stdout, "encoding", None) or "utf-8"
print(out.encode(enc, errors="replace").decode(enc, errors="replace"))
if err.strip():
    print("ERR:", err.encode(enc, errors="replace").decode(enc, errors="replace"))
print("exit", code)

_, o2, _ = c.exec_command("grep ADMIN_PASSWORD /www/wwwroot/zhubo-control-center/.env", timeout=30)
print(o2.read().decode("utf-8", errors="replace"))
c.close()
