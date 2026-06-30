import os
import zipfile
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PASSWORD = os.environ.get("SSH_PASS", "")

# Build web locally first - caller should run npm run build -w @zhubo/control-web

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

web_dist = ROOT / "apps/control-web/dist"
if not web_dist.exists():
    raise SystemExit("Run: npm run build -w @zhubo/control-web")

with zipfile.ZipFile(ROOT / "deploy-output-web.zip", "w", zipfile.ZIP_DEFLATED) as zf:
    for f in web_dist.rglob("*"):
        if f.is_file():
            zf.write(f, str(f.relative_to(web_dist)).replace("\\", "/"))

sftp = c.open_sftp()
sftp.put(str(ROOT / "deploy-output-web.zip"), "/tmp/control-web.zip")
sftp.close()

script = (ROOT / "deploy/aliyun/setup-port80-control.sh").read_text(encoding="utf-8").replace("\r\n", "\n")
# simplified remote script without rebuild on server
remote = """#!/usr/bin/env bash
set -euo pipefail
DIST=/www/wwwroot/zhubo-control-center/apps/control-web/dist
rm -rf "$DIST"
mkdir -p "$DIST"
unzip -q /tmp/control-web.zip -d "$DIST"

CONF=/etc/aa_nginx/conf.d/zhubo-analysis.conf
if ! grep -q 'location /control/' "$CONF"; then
  cat >> "$CONF" << 'SNIP'

    location /control/ {
        proxy_pass http://127.0.0.1:4790/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
SNIP
fi

/usr/sbin/aa_nginx -t
master_pid=$(ps aux | awk '/nginx: master process \\/usr\\/sbin\\/aa_nginx/ && !/grep/ {print $2; exit}')
kill -HUP "$master_pid"
sleep 1
curl -sf http://127.0.0.1/control/api/health
echo " OK"
"""

c.exec_command("cat > /tmp/setup-port80.sh << 'EOF'\n" + remote + "\nEOF\nchmod +x /tmp/setup-port80.sh")
_, o, e = c.exec_command("bash /tmp/setup-port80.sh", timeout=120)
enc = getattr(__import__("sys").stdout, "encoding", None) or "utf-8"
print(o.read().decode("utf-8", errors="replace").encode(enc, errors="replace").decode(enc, errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err.encode(enc, errors="replace").decode(enc, errors="replace"))
print("exit", o.channel.recv_exit_status())
c.close()
