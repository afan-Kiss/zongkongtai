#!/usr/bin/env node
/** 各子项目 manifest riskLevel 提交并 push（仅 zhubo-control.manifest.json） */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.SCAN_ROOT || 'E:\\我的软件源码';

const REPOS = [
  { dir: '主播分析软件', remote: 'zhubofenxi' },
  { dir: '千帆中转机器人', remote: 'qianfan_jiqiren' },
  { dir: '扫码枪登记出入库系统', remote: 'saomaqiang' },
  { dir: '记账系统', remote: 'jizhangxitong' },
  { dir: '祥钰系统', remote: 'xiangyupaizhao' },
  { dir: '辅助出库软件', remote: 'churuku' },
  { dir: '抖店', remote: 'doudian' },
  { dir: '抖店机器人', remote: 'qianfan_jiqiren' },
];

const NO_GIT = ['抖店gemini建议', '抖店聊天记录导出'];

function run(cwd, cmd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

const report = [];

for (const { dir, remote } of REPOS) {
  const cwd = path.join(ROOT, dir);
  const manifest = path.join(cwd, 'zhubo-control.manifest.json');
  if (!fs.existsSync(manifest)) {
    report.push({ dir, status: 'skip', reason: 'no manifest' });
    continue;
  }
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    report.push({ dir, status: 'skip', reason: 'no git' });
    continue;
  }
  try {
    const status = run(cwd, 'git status --porcelain zhubo-control.manifest.json');
    if (!status) {
      const head = run(cwd, 'git rev-parse HEAD');
      const remoteHead = run(cwd, 'git ls-remote origin main').split('\t')[0] || '';
      report.push({ dir, status: 'unchanged', head, remoteHead, synced: head === remoteHead });
      continue;
    }
    run(cwd, 'git add zhubo-control.manifest.json');
    run(cwd, 'git commit -m "chore: add riskLevel to zhubo-control manifest"');
    run(cwd, 'git push origin main');
    const head = run(cwd, 'git rev-parse HEAD');
    const remoteHead = run(cwd, 'git ls-remote origin main').split('\t')[0] || '';
    report.push({ dir, status: 'pushed', head, remoteHead, synced: head === remoteHead });
  } catch (e) {
    report.push({ dir, status: 'error', error: e.stderr || e.message });
  }
}

for (const dir of NO_GIT) {
  report.push({ dir, status: 'local_only', reason: '无 Git 仓库，仅本地 manifest 已更新' });
}

console.log(JSON.stringify({ ok: true, report }, null, 2));
