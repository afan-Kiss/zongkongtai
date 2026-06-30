#!/usr/bin/env python3
import json, urllib.request, urllib.error, paramiko, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd_ssh = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd_ssh, timeout=60)
_, o, _ = c.exec_command(r"""cd /www/wwwroot/zhubo-control-center/apps/control-server && node - <<'NODE'
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('../../.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); return [l.slice(0,i), l.slice(i+1)];}));
const prisma = new PrismaClient();
(async () => {
  const u = await prisma.user.findUnique({ where: { username: 'admin' } });
  const ok = u ? await bcrypt.compare(env.ADMIN_PASSWORD || '', u.passwordHash) : false;
  console.log(JSON.stringify({ hasUser: !!u, pwLen: (env.ADMIN_PASSWORD||'').length, pwFp: require('crypto').createHash('sha256').update(env.ADMIN_PASSWORD||'').digest('hex').slice(0,12), bcryptOk: ok }));
  await prisma.$disconnect();
})();
NODE""", timeout=30)
print(o.read().decode())
c.close()

BASE = "http://8.137.126.18/control"
# try login with deploy-output password fp match
cred_pw = None
cred = ROOT / "deploy-output-credentials.txt"
if cred.exists():
    for line in cred.read_text(encoding="utf-8").splitlines():
        if line.startswith("ADMIN_PASSWORD="):
            cred_pw = line.split("=", 1)[1].strip()
for label, pw in [("cred", cred_pw), ("localenv", "Zhubo@2026!")]:
    if not pw:
        continue
    body = json.dumps({"username":"admin","password":pw}).encode()
    req = urllib.request.Request(f"{BASE}/api/auth/login", data=body, method="POST", headers={"Content-Type":"application/json","Origin":"http://8.137.126.18"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(label, "login ok", r.status)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:120]
        print(label, "login", e.code, body)
