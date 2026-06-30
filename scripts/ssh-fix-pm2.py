#!/usr/bin/env python3
import paramiko
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pwd = next(
    line.split("=", 1)[1].strip().strip('"').strip("'")
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
    if line.startswith("SSH_PASS=")
)

ecosystem = (ROOT / "ecosystem.config.cjs").read_text(encoding="utf-8")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

sftp = c.open_sftp()
with sftp.open("/www/wwwroot/zhubo-control-center/ecosystem.config.cjs", "w") as f:
    f.write(ecosystem)
sftp.close()

cmd = """
cd /www/wwwroot/zhubo-control-center
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=file:./prod.db|' .env
grep DATABASE_URL .env
pm2 delete zhubo-control-center || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 2
curl -sf http://127.0.0.1:4790/api/health
cd apps/control-server && DATABASE_URL=file:./prod.db node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.secretStore.count().then(c=>console.log('secret count',c)).finally(()=>p.\\$disconnect())"
"""
_, o, _ = c.exec_command(cmd, timeout=120)
print(o.read().decode("utf-8", errors="replace"))
c.close()
