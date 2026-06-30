#!/usr/bin/env python3
"""只读：诊断上传 504（nginx 超时、pm2 日志、本地上传延迟）。"""
from ops_config import ANALYSIS_PM2, CONTROL_DB, CONTROL_PM2, CONTROL_ROOT, SERVER_HOST
from ops_lib import run_check_cmds

run_check_cmds(
    [
        "grep -r proxy_read_timeout /etc/aa_nginx/conf.d/ 2>/dev/null | head -20",
        "grep -A30 'location /control' /etc/aa_nginx/conf.d/*.conf 2>/dev/null | head -40",
        f"export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh; pm2 logs {CONTROL_PM2} --lines 30 --nostream 2>&1 | tail -35",
        f"ls -la {CONTROL_DB}* 2>/dev/null",
        f"""python3 - <<'PY'
import json, time, urllib.request
token = open('{CONTROL_ROOT}/.env').read().split('SERVICE_TOKEN=')[1].split('\\n')[0].strip()
body = json.dumps({{
  'platform': 'qianfan', 'shopName': '部署验收测试店',
  'cookie': 'ping=1; xhsTrackerId=latency-test', 'collectorProject': 'latency-probe'
}}).encode()
for label, url in [('local4790', 'http://127.0.0.1:4790/api/secrets/qianfan/upload-cookie'),
                   ('public', 'http://{SERVER_HOST}/control/api/secrets/qianfan/upload-cookie')]:
    req = urllib.request.Request(url, data=body, method='POST', headers={{
        'Content-Type': 'application/json', 'Authorization': f'Bearer {{token}}'
    }})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print(label, r.status, round(time.time()-t0, 2), 's', r.read()[:80])
    except Exception as e:
        print(label, 'ERR', round(time.time()-t0, 2), 's', type(e).__name__, str(e)[:120])
PY""",
    ],
    timeout=150,
)
