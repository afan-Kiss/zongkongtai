import os
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = os.environ.get("SSH_PASS", "")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

script = (ROOT / "deploy/aliyun/setup-aa-nginx.sh").read_text(encoding="utf-8").replace("\r\n", "\n")
c.exec_command("cat > /tmp/setup-aa-nginx.sh << 'EOF'\n" + script + "\nEOF\nchmod +x /tmp/setup-aa-nginx.sh")
_, o, e = c.exec_command("bash /tmp/setup-aa-nginx.sh", timeout=120)
out = o.read().decode("utf-8", errors="replace")
err = e.read().decode("utf-8", errors="replace")
enc = getattr(__import__("sys").stdout, "encoding", None) or "utf-8"
print(out.encode(enc, errors="replace").decode(enc, errors="replace"))
if err.strip():
    print("ERR:", err.encode(enc, errors="replace").decode(enc, errors="replace"))
print("exit", o.channel.recv_exit_status())
c.close()
