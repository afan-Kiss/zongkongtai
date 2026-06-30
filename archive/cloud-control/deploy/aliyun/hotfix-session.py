import os
import paramiko

PASSWORD = os.environ.get("SSH_PASS", "")
HOST = "8.137.126.18"

REMOTE = r"""
set -e
cd /www/wwwroot/zhubo-control-center
APP=apps/control-server/dist/app.js
# trust proxy
if ! grep -q 'trust proxy' "$APP"; then
  sed -i 's/const app = express_1.default();/const app = express_1.default();\n    app.set("trust proxy", 1);/' "$APP"
fi
# cookie secure off for HTTP
sed -i 's/secure: config_1.config.nodeEnv === .production./secure: process.env.COOKIE_SECURE === "true"/' "$APP" || \
sed -i 's/secure: true/secure: false/' "$APP"
grep -q '^COOKIE_SECURE=' .env || echo 'COOKIE_SECURE=false' >> .env
pm2 restart zhubo-control-center
sleep 2
curl -sf http://127.0.0.1:4790/api/health && echo pm2-ok
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASSWORD, timeout=60)
_, o, e = c.exec_command(REMOTE, timeout=120)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err)
print("exit", o.channel.recv_exit_status())
c.close()
