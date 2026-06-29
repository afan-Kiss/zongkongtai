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
for cmd in [
    "cat /www/wwwroot/zhubo-control-center/.env",
    "pm2 env 13 2>/dev/null | grep DATABASE || pm2 show zhubo-control-center | grep -A2 DATABASE",
    "cd /www/wwwroot/zhubo-control-center/apps/control-server && node -e \"const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.secretStore.count().then(c=>console.log('count',c)).catch(e=>console.error(e.message)).finally(()=>p.\\$disconnect())\"",
]:
    _, o, e = c.exec_command(cmd, timeout=60)
    print(">>>", cmd[:90])
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR:", err[:500])
c.close()
