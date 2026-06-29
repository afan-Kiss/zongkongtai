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
sftp = c.open_sftp()
sftp.put(
    str(ROOT / "apps/control-server/prisma/seed.ts"),
    "/www/wwwroot/zhubo-control-center/apps/control-server/prisma/seed.ts",
)
sftp.close()
_, o, _ = c.exec_command(
    "cd /www/wwwroot/zhubo-control-center/apps/control-server && export DATABASE_URL=file:./prisma/prod.db && npx tsx prisma/seed.ts",
    timeout=120,
)
print(o.read().decode("utf-8", errors="replace"))
c.close()
