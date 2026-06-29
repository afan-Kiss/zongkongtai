#!/usr/bin/env python3
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pwd = next(
    line.split("=", 1)[1].strip().strip('"').strip("'")
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
    if line.startswith("SSH_PASS=")
)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

def run(cmd: str, timeout: int = 3600) -> int:
    print(f"\n>>> {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip().encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
    if err.strip():
        print(err.rstrip().encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
    return code

run("ls -la /www/wwwroot/zhubo-control-center | head -20")
run("ls -la /www/wwwroot/zhubo-control-center/apps/control-server/src/routes/secrets.ts 2>&1 | head -3")
run("grep -n rawShopName /www/wwwroot/zhubo-control-center/apps/control-server/src/routes/secrets.ts 2>/dev/null | head -5 || echo no_rawShopName")
run("grep -n buildQianfanShopCards /www/wwwroot/zhubo-control-center/packages/control-shared/src/qianfanShops.ts 2>/dev/null | head -3 || echo no_shared")

code = run(
    """
set -e
cd /www/wwwroot/zhubo-control-center
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
npm install
cd apps/control-server
export DATABASE_URL="${DATABASE_URL:-file:./prisma/prod.db}"
npx prisma generate
npx prisma db push --accept-data-loss
cd /www/wwwroot/zhubo-control-center
npm run build
pm2 restart zhubo-control-center
sleep 2
curl -sf http://127.0.0.1:4790/api/health
"""
)
c.close()
raise SystemExit(code)
