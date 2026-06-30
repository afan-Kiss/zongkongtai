#!/usr/bin/env python3
import json, urllib.request, urllib.error, urllib.parse, paramiko, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, _ = c.exec_command("grep '^ADMIN_PASSWORD=' /www/wwwroot/zhubo-control-center/.env", timeout=10)
server_pw = o.read().decode().strip().split("=",1)[-1] if "=" in o.read().decode() else ""
_, o2, _ = c.exec_command("grep '^ADMIN_PASSWORD=' /www/wwwroot/zhubo-control-center/.env | cut -d= -f2-", timeout=10)
server_pw = o2.read().decode().strip()
c.close()

BASE = "http://8.137.126.18/control"
for label, pw in [("deploy-cred", Path(ROOT/"deploy-output-credentials.txt").read_text(encoding="utf-8").split("ADMIN_PASSWORD=")[1].split("\n")[0].strip() if (ROOT/"deploy-output-credentials.txt").exists() else ""), ("local-env", "Zhubo@2026!"), ("server-env", server_pw)]:
    body = json.dumps({"username":"admin","password":pw}).encode()
    req = urllib.request.Request(f"{BASE}/api/auth/login", data=body, method="POST", headers={"Content-Type":"application/json","Origin":"http://8.137.126.18"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(label, "login", r.status)
    except urllib.error.HTTPError as e:
        print(label, "login", e.code)

# secrets via bearer-less admin - use sqlite on server for shop details
cmd = """sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db "select shopName, substr(cookieHash,1,8), valuePreview, datetime(updatedAt/1000,'unixepoch') as updatedAt from SecretStore where platform='qianfan' and archived=0 order by shopName;"
"""
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, _ = c.exec_command(cmd, timeout=15)
sys.stdout.buffer.write(b"\n=== formal shops in DB ===\n")
sys.stdout.buffer.write(o.read())
# operation logs
_, o2, _ = c.exec_command("sqlite3 /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db \"select action, datetime(createdAt/1000,'unixepoch'), substr(detail,1,80) from OperationLog where action in ('qianfan_cookie_upload','secret_resolve') order by createdAt desc limit 12;\"", timeout=15)
sys.stdout.buffer.write(b"\n=== OperationLog ===\n")
sys.stdout.buffer.write(o2.read())
c.close()
