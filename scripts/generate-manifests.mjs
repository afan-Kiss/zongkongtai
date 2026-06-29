#!/usr/bin/env node
/** 为 E:\我的软件源码 下各项目生成 zhubo-control.manifest.json */
import fs from 'fs';
import path from 'path';

const ROOT = process.env.SCAN_ROOT || 'E:\\我的软件源码';

const MANIFESTS = [
  {
    dir: '总控台',
    manifest: {
      manifestVersion: 1,
      name: '珠宝项目总控台',
      code: 'zhubo-control',
      category: '总控',
      locationType: 'mixed',
      gitRemote: 'https://github.com/afan-Kiss/zongkongtai.git',
      localPath: 'E:\\我的软件源码\\总控台',
      desktopStartCommand: 'npm run dev:desktop',
      desktopStopMode: 'process-tree',
      localWebUrl: 'http://127.0.0.1:4791',
      localHealthUrl: 'http://127.0.0.1:4790/api/health',
      publicUrl: 'http://8.137.126.18/control/',
      healthType: 'http',
      ports: [4790, 4791],
      services: [
        { name: 'server', command: 'npm run dev:server', port: 4790, healthUrl: 'http://127.0.0.1:4790/api/health' },
        { name: 'web', command: 'npm run dev:web', port: 4791, webUrl: 'http://127.0.0.1:4791' },
        { name: 'agent', command: 'npm run dev:agent', type: 'worker' },
      ],
      control: { enabled: true, showInDesktop: true, cookieMode: 'control', favorite: true, notes: '本地 EXE + 云端 Cookie 中心' },
    },
  },
  {
    dir: '主播分析软件',
    manifest: {
      manifestVersion: 1,
      name: '主播分析软件',
      code: 'zhubo-analysis',
      category: '主播分析',
      locationType: 'mixed',
      gitRemote: 'https://github.com/afan-Kiss/zhubofenxi.git',
      localPath: 'E:\\我的软件源码\\主播分析软件',
      desktopStartCommand: 'npm run dev',
      localWebUrl: 'http://127.0.0.1:5173',
      localHealthUrl: 'http://127.0.0.1:4723/api/health',
      publicUrl: 'http://8.137.126.18/',
      healthType: 'http',
      ports: [4723, 5173],
      services: [
        { name: 'server', command: 'npm run dev:server', port: 4723, healthUrl: 'http://127.0.0.1:4723/api/health' },
        { name: 'web', command: 'npm run dev:web', port: 5173, webUrl: 'http://127.0.0.1:5173' },
      ],
      control: { enabled: true, showInDesktop: true, cookieMode: 'control', favorite: true, notes: '已接入总控 Cookie；云端 PM2 zhubo-analysis' },
    },
  },
  {
    dir: '千帆中转机器人',
    manifest: {
      manifestVersion: 1,
      name: '千帆中转机器人',
      code: 'qianfan-relay',
      category: '千帆',
      gitRemote: 'https://github.com/afan-Kiss/qianfan_jiqiren.git',
      localPath: 'E:\\我的软件源码\\千帆中转机器人',
      desktopStartCommand: 'npm start',
      desktopStopMode: 'process-tree',
      healthType: 'process',
      ports: [8787, 9322],
      control: { enabled: true, showInDesktop: true, cookieMode: 'none', favorite: true, notes: '负责上传四店 Cookie 到总控；无 HTTP health' },
    },
  },
  {
    dir: '扫码枪登记出入库系统',
    manifest: {
      manifestVersion: 1,
      name: '扫码枪登记出入库系统',
      code: 'jade-scan',
      category: '扫码/出入库',
      gitRemote: 'https://github.com/afan-Kiss/saomaqiang.git',
      localPath: 'E:\\我的软件源码\\扫码枪登记出入库系统',
      desktopStartCommand: 'npm run dev',
      localWebUrl: 'http://127.0.0.1:5173',
      localHealthUrl: 'http://127.0.0.1:4725/api/health',
      healthType: 'http',
      ports: [4725, 5173, 4726, 4727, 4728, 4729, 7789],
      services: [
        { name: 'server', command: 'npm run dev:server', port: 4725, healthUrl: 'http://127.0.0.1:4725/api/health' },
        { name: 'web', command: 'npm run dev:web', port: 5173, webUrl: 'http://127.0.0.1:5173' },
      ],
      control: { enabled: true, showInDesktop: true, cookieMode: 'pending', notes: '多服务 monorepo，含祥钰子应用' },
    },
  },
  {
    dir: '记账系统',
    manifest: {
      manifestVersion: 1,
      name: '记账系统',
      code: 'jade-accounting',
      category: '记账',
      gitRemote: 'https://github.com/afan-Kiss/jizhangxitong.git',
      localPath: 'E:\\我的软件源码\\记账系统',
      desktopStartCommand: 'npm run dev',
      localWebUrl: 'http://127.0.0.1:5173',
      localHealthUrl: 'http://127.0.0.1:3001/api/health',
      publicUrl: 'http://8.137.126.18/account/',
      healthType: 'http',
      ports: [3001, 5173],
      services: [
        { name: 'server', command: 'npm run dev:server', port: 3001, healthUrl: 'http://127.0.0.1:3001/api/health' },
        { name: 'web', command: 'npm run dev:web', port: 5173, webUrl: 'http://127.0.0.1:5173' },
        { name: 'worker', command: 'npm run dev:worker', type: 'worker' },
      ],
      control: { enabled: true, showInDesktop: true, cookieMode: 'none' },
    },
  },
  {
    dir: '祥钰系统',
    manifest: {
      manifestVersion: 1,
      name: '祥钰系统',
      code: 'xiangyu-system',
      category: '工具服务',
      gitRemote: 'https://github.com/afan-Kiss/xiangyupaizhao.git',
      localPath: 'E:\\我的软件源码\\祥钰系统',
      desktopStartCommand: 'npm start',
      localWebUrl: 'http://127.0.0.1:4726',
      localHealthUrl: 'http://127.0.0.1:4726/api/health',
      healthType: 'http',
      ports: [4726, 4727],
      control: { enabled: true, showInDesktop: true, cookieMode: 'pending' },
    },
  },
  {
    dir: '辅助出库软件',
    manifest: {
      manifestVersion: 1,
      name: '辅助出库软件',
      code: 'churuku-helper',
      category: '扫码/出入库',
      gitRemote: 'https://github.com/afan-Kiss/churuku.git',
      localPath: 'E:\\我的软件源码\\辅助出库软件',
      desktopStartCommand: 'dist\\库存出入库辅助.exe',
      desktopStopMode: 'process-tree',
      healthType: 'process',
      control: { enabled: true, showInDesktop: true, cookieMode: 'none', notes: 'PyQt GUI，无 Web/health' },
    },
  },
  {
    dir: '抖店',
    manifest: {
      manifestVersion: 1,
      name: '抖店 CDP 工具',
      code: 'doudian-cdp',
      category: '抖店',
      gitRemote: 'https://github.com/afan-Kiss/doudian.git',
      localPath: 'E:\\我的软件源码\\抖店',
      desktopStartCommand: 'python scripts/listen_inbound.py',
      healthType: 'process',
      ports: [9222],
      control: { enabled: true, showInDesktop: true, cookieMode: 'none', notes: 'Python CDP，仅登记' },
    },
  },
  {
    dir: '抖店gemini建议',
    manifest: {
      manifestVersion: 1,
      name: '抖店 Gemini 建议',
      code: 'doudian-gemini',
      category: 'AI 客服',
      localPath: 'E:\\我的软件源码\\抖店gemini建议',
      desktopStartCommand: 'npm start',
      healthType: 'process',
      ports: [9333],
      control: { enabled: true, showInDesktop: true, cookieMode: 'none', notes: '飞鸽 AI 回复，无标准 health' },
    },
  },
  {
    dir: '抖店机器人',
    manifest: {
      manifestVersion: 1,
      name: '抖店机器人',
      code: 'doudian-bot',
      category: '抖店',
      gitRemote: 'https://github.com/afan-Kiss/qianfan_jiqiren.git',
      localPath: 'E:\\我的软件源码\\抖店机器人',
      desktopStartCommand: 'npm start',
      healthType: 'process',
      ports: [19527, 9333],
      control: { enabled: true, showInDesktop: true, cookieMode: 'none' },
    },
  },
  {
    dir: '抖店聊天记录导出',
    manifest: {
      manifestVersion: 1,
      name: '抖店聊天记录导出',
      code: 'doudian-chat-export',
      category: '抖店',
      localPath: 'E:\\我的软件源码\\抖店聊天记录导出',
      desktopStartCommand: 'npm run web',
      localWebUrl: 'http://127.0.0.1:4738',
      localHealthUrl: 'http://127.0.0.1:4738/api/health',
      healthType: 'http',
      ports: [4738],
      control: { enabled: true, showInDesktop: true, cookieMode: 'none' },
    },
  },
];

let written = 0;
for (const { dir, manifest } of MANIFESTS) {
  const projectDir = path.join(ROOT, dir);
  if (!fs.existsSync(projectDir)) {
    console.warn('SKIP missing', dir);
    continue;
  }
  const file = path.join(projectDir, 'zhubo-control.manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('WROTE', file);
  written += 1;
}
console.log(`Done: ${written} manifests`);
