#!/usr/bin/env python3
import paramiko, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmd = """
echo '=== env ==='
grep -E 'DATABASE_URL|SECRET_ENCRYPTION' /www/wwwroot/zhubo-control-center/.env
echo '=== ecosystem cwd ==='
grep -E 'cwd|DATABASE' /www/wwwroot/zhubo-control-center/ecosystem.config.cjs | head -10
echo '=== db files ==='
find /www/wwwroot/zhubo-control-center -name 'prod.db*' -ls 2>/dev/null
echo '=== pm2 describe ==='
pm2 describe zhubo-control-center 2>/dev/null | grep -E 'exec cwd|status|restarts'
echo '=== df ==='
df -h /www/wwwroot/zhubo-control-center
echo '=== lsof db ==='
lsof /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db 2>/dev/null | head -10 || fuser -v /www/wwwroot/zhubo-control-center/apps/control-server/prisma/prod.db 2>&1 | head -5
"""
_, o, e = c.exec_command(cmd, timeout=30)
sys.stdout.buffer.write(o.read())
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err[:400])
c.close()
