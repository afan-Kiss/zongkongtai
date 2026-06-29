import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'Zhubo@2026!';
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: { passwordHash: hash },
    create: { username, passwordHash: hash },
  });

  const knownProjects = [
    {
      name: '主播分析软件',
      code: 'zhubo-analysis',
      category: '主播分析',
      locationType: 'cloud',
      serverPath: '/www/wwwroot/zhubo-analysis',
      pm2Name: 'zhubo-analysis',
      healthUrl: 'http://127.0.0.1:4723/api/health',
      publicUrl: 'http://8.137.126.18/api/health',
      internalUrl: 'http://127.0.0.1:4723',
      startCommand: 'npm run start',
      packageManager: 'npm',
      status: 'running',
      notes: '已部署在阿里云，PM2 管理',
    },
    {
      name: '扫码枪登记出入库系统',
      code: 'scanner-system',
      category: '扫码系统',
      locationType: 'local',
      localPath: 'E:\\我的软件源码\\扫码枪登记出入库系统',
      localWebUrl: 'http://127.0.0.1:5173',
      localHealthUrl: 'http://127.0.0.1:4725/api/health',
      healthUrl: 'http://127.0.0.1:4725/api/health',
      internalUrl: 'http://127.0.0.1:5173',
      packageManager: 'npm',
      status: 'unknown',
      notes: '桌面 dev：Web 5173，API health 4725',
    },
    {
      name: '祥钰系统',
      code: 'xiangyu-system',
      category: '祥钰',
      locationType: 'local',
      localPath: 'E:\\我的软件源码\\扫码枪登记出入库系统\\apps\\xiangyu',
      localWebUrl: 'http://127.0.0.1:4726',
      localHealthUrl: 'http://127.0.0.1:4726/api/health',
      healthUrl: 'http://127.0.0.1:4726/api/health',
      internalUrl: 'http://127.0.0.1:4726',
      desktopStartCommand: 'node server/index.js',
      packageManager: 'npm',
      status: 'unknown',
      notes: '桌面 EXE：Web/health 4726；9323 为历史 bridge',
    },
    {
      name: 'AI客服助手',
      code: 'ai-customer-service',
      category: 'AI客服',
      locationType: 'local',
      internalUrl: 'http://127.0.0.1:7788',
      status: 'unknown',
      notes: '端口 7788 待 Agent 扫描确认',
    },
    {
      name: '记账系统',
      code: 'jade-accounting',
      category: '记账系统',
      locationType: 'mixed',
      localPath: 'E:\\我的软件源码\\记账系统',
      packageManager: 'npm',
      status: 'unknown',
    },
    {
      name: '千帆中转机器人',
      code: 'qianfan-bot',
      category: '千帆',
      locationType: 'local',
      localPath: 'E:\\我的软件源码\\千帆中转机器人',
      status: 'unknown',
    },
  ];

  for (const p of knownProjects) {
    await prisma.project.upsert({
      where: { code: p.code },
      update: p,
      create: p,
    });
  }

  console.log('Seed done. Admin user:', username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
