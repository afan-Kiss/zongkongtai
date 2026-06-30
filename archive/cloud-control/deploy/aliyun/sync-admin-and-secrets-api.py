#!/usr/bin/env python3
"""Sync admin password from server .env and verify secrets API (no cookie values printed)."""
import json, urllib.request, urllib.error, paramiko, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
fix = r"""
cd /www/wwwroot/zhubo-control-center/apps/control-server
export $(grep -E '^(ADMIN_USERNAME|ADMIN_PASSWORD|DATABASE_URL)=' ../../.env | xargs)
node - <<'NODE'
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || '';
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({ where: { username }, update: { passwordHash: hash }, create: { username, passwordHash: hash } });
  console.log('admin synced for', username);
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
NODE
"""
_, o, e = c.exec_command(fix, timeout=60)
sys.stdout.buffer.write(o.read())
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err[:400])
c.close()

BASE = "http://8.137.126.18/control"
# read server admin password only for login test - don't print
c2 = paramiko.SSHClient(); c2.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c2.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o2, _ = c2.exec_command("grep '^ADMIN_PASSWORD=' /www/wwwroot/zhubo-control-center/.env | cut -d= -f2-", timeout=10)
admin_pw = o2.read().decode().strip()
c2.close()

login_body = json.dumps({"username": "admin", "password": admin_pw}).encode()
req = urllib.request.Request(f"{BASE}/api/auth/login", data=login_body, method="POST", headers={"Content-Type": "application/json", "Origin": "http://8.137.126.18"})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        cookies = r.headers.get_all("Set-Cookie") or []
        cookie = "; ".join(x.split(";")[0] for x in cookies)
        print("admin login:", r.status)
except urllib.error.HTTPError as ex:
    print("admin login:", ex.code)
    cookie = ""
    sys.exit(1)

req2 = urllib.request.Request(f"{BASE}/api/secrets", headers={"Cookie": cookie})
with urllib.request.urlopen(req2, timeout=20) as r:
    items = json.loads(r.read().decode())
    qf = [x for x in items if x.get("platform") == "qianfan" and x.get("keyName") == "cookie"]
    formal = ["拾玉居和田玉", "和田雅玉", "祥钰珠宝", "XY祥钰珠宝"]
    print(f"secrets API: {len(qf)} qianfan cookie rows")
    for shop in formal:
        hit = next((x for x in qf if x.get("shopName") == shop), None)
        if not hit:
            print(f"  {shop}: MISSING")
            continue
        ch = str(hit.get("cookieHash") or "")[:8]
        print(f"  {shop}: preview={'有' if hit.get('valuePreview') else '无'} updatedAt={hit.get('updatedAt')} hash8={ch} hasEncrypted={'encryptedValue' in hit}")
