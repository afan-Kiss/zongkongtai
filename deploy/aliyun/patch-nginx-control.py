import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=PASSWORD, timeout=60)

patch_script = r"""
CONF=/etc/aa_nginx/conf.d/zhubo-analysis.conf
python3 - << 'PY'
from pathlib import Path
conf = Path("/etc/aa_nginx/conf.d/zhubo-analysis.conf")
text = conf.read_text(encoding="utf-8")
if "location /control/" in text:
    print("already patched")
else:
    block = '''
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

'''
    marker = "    access_log /www/wwwlogs/zhubo-analysis.access.log;"
    if marker not in text:
        raise SystemExit("marker not found")
    text = text.replace(marker, block + marker)
    conf.write_text(text, encoding="utf-8")
    print("patched")
PY
/usr/sbin/aa_nginx -t
master_pid=$(ps aux | awk '/nginx: master process \/usr\/sbin\/aa_nginx/ && !/grep/ {print $2; exit}')
kill -HUP "$master_pid"
curl -sf http://127.0.0.1/control/api/health
echo OK
"""

_, o, e = c.exec_command(patch_script, timeout=120)
enc = getattr(__import__("sys").stdout, "encoding", None) or "utf-8"
print(o.read().decode("utf-8", errors="replace").encode(enc, errors="replace").decode(enc, errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err.encode(enc, errors="replace").decode(enc, errors="replace"))
c.close()
