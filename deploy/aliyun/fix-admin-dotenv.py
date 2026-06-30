#!/usr/bin/env python3
import paramiko, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
pwd = next(l.split("=",1)[1].strip().strip('"').strip("'") for l in (ROOT/".env").read_text(encoding="utf-8").splitlines() if l.startswith("SSH_PASS="))
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
cmd = r"""
cd /www/wwwroot/zhubo-control-center/apps/control-server
node -e "
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();
(async () => {
  const pw = process.env.ADMIN_PASSWORD || '';
  const hash = await bcrypt.hash(pw, 10);
  await prisma.user.upsert({ where: { username: 'admin' }, update: { passwordHash: hash }, create: { username: 'admin', passwordHash: hash } });
  const u = await prisma.user.findUnique({ where: { username: 'admin' } });
  const ok = await bcrypt.compare(pw, u.passwordHash);
  console.log(JSON.stringify({ pwLen: pw.length, pwFp: crypto.createHash('sha256').update(pw).digest('hex').slice(0,12), bcryptOk: ok, dbUrl: process.env.DATABASE_URL }));
  await prisma.$disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
"
"""
_, o, e = c.exec_command(cmd, timeout=45)
sys.stdout.buffer.write(o.read())
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[:300])
c.close()
