#!/usr/bin/env python3
"""fix：同步 admin 用户 bcrypt（需 --execute；默认 dry-run）。"""
from ops_config import CONTROL_ROOT
from ops_lib import parse_fix_args, run_ssh, ssh_session

NODE_CMD = r"""
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


def main() -> None:
    execute = parse_fix_args("同步 admin 用户密码哈希到生产库")
    print("将执行：Node 脚本 upsert admin 用户（使用服务器 .env 中 ADMIN_PASSWORD）")
    print("不会重置 ADMIN_PASSWORD 或 Cookie。")
    if not execute:
        return
    with ssh_session() as client:
        run_ssh(client, NODE_CMD, timeout=45)


if __name__ == "__main__":
    main()
