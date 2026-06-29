#!/usr/bin/env python3
import sys
import paramiko
from pathlib import Path

def sp(s):
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    print(s.encode(enc, errors="replace").decode(enc, errors="replace"))

def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out

ROOT = Path(__file__).resolve().parents[2]
pwd = ""
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)

_, o, _ = c.exec_command("cat /www/wwwroot/zhubo-control-center/.env", timeout=30)
env = parse_env(o.read().decode("utf-8", errors="replace"))

exports = " ".join(
    f'export {k}="{v.replace(chr(34), chr(92)+chr(34))}"'
    for k, v in env.items()
    if k.isidentifier() or k.replace("_", "").isalnum()
)

DEPLOY = "/www/wwwroot/zhubo-control-center"
cmd = f"""
set -e
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
{exports}
cd {DEPLOY}/apps/control-server
export DATABASE_URL="${{DATABASE_URL:-file:./prisma/prod.db}}"
npx tsx prisma/seed.ts
rm -rf prisma/prisma
cd {DEPLOY}
pm2 restart zhubo-control-center
sleep 2
sqlite3 apps/control-server/prisma/prod.db "select count(*) from User;"
"""
_, o, e = c.exec_command(cmd, timeout=180)
sp(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    sp("ERR:\n" + err)
c.close()
