#!/usr/bin/env python3
import json, time, urllib.request, urllib.error, paramiko
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
cookie = "a=1; b=2; " + "; ".join(f"k{i}={i}" for i in range(80))
body_tpl = json.dumps({"platform":"qianfan","shopName":"部署验收测试店","cookie":cookie,"collectorProject":"latency-probe"})
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, _ = c.exec_command("grep '^SERVICE_TOKEN=' /www/wwwroot/zhubo-control-center/.env | cut -d= -f2-", timeout=10)
token = o.read().decode().strip()
remote = f"""python3 - <<'PY'
import json, time, urllib.request, urllib.error
token={json.dumps(token)}
body={body_tpl!r}.encode()
for label, url in [("local4790","http://127.0.0.1:4790/api/secrets/qianfan/upload-cookie"),("public","http://8.137.126.18/control/api/secrets/qianfan/upload-cookie")]:
    req = urllib.request.Request(url, data=body, method='POST', headers={{"Content-Type":"application/json","Authorization":f"Bearer {{token}}"}})
    t0=time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print(label, r.status, round(time.time()-t0,2))
    except urllib.error.HTTPError as e:
        print(label, e.code, round(time.time()-t0,2))
    except Exception as e:
        print(label, type(e).__name__, round(time.time()-t0,2), str(e)[:80])
PY"""
_, o, e = c.exec_command(remote, timeout=150)
print(o.read().decode("utf-8", errors="replace"))
c.close()
