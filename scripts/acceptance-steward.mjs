#!/usr/bin/env node
/** 项目管家一期验收 — 共享模块 + 线上 steward API（可选） */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  filterGitPaths,
  normalizeRiskLevel,
  DEFAULT_RISK_BY_CODE,
} from '../packages/control-shared/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// --- 本地：Git 安全过滤 ---
const blocked = filterGitPaths(['.env', 'src/index.ts', 'node_modules/x/a.js']);
if (blocked.blocked.length !== 2) {
  console.error('FAIL: git filter expected 2 blocked, got', blocked.blocked.length);
  process.exit(1);
}
if (blocked.safe.length !== 1 || blocked.safe[0] !== 'src/index.ts') {
  console.error('FAIL: git filter safe paths', blocked.safe);
  process.exit(1);
}

// --- 本地：riskLevel 映射 ---
const requiredCodes = [
  'zhubo-control',
  'zhubo-analysis',
  'qianfan-relay',
  'jade-scan',
  'jade-accounting',
  'xiangyu-system',
  'churuku-helper',
  'doudian-cdp',
  'doudian-bot',
  'doudian-chat-export',
  'doudian-gemini',
];
for (const code of requiredCodes) {
  const level = normalizeRiskLevel(DEFAULT_RISK_BY_CODE[code]);
  if (!level) {
    console.error('FAIL: missing DEFAULT_RISK_BY_CODE for', code);
    process.exit(1);
  }
}
if (normalizeRiskLevel(DEFAULT_RISK_BY_CODE['zhubo-control']) !== 'protected') {
  console.error('FAIL: zhubo-control risk should be protected');
  process.exit(1);
}

// --- 本地：11 个 manifest 均有 riskLevel ---
const scanRoot = process.env.SCAN_ROOT || 'E:\\我的软件源码';
const manifestDirs = [
  '总控台',
  '主播分析软件',
  '千帆中转机器人',
  '扫码枪登记出入库系统',
  '记账系统',
  '祥钰系统',
  '辅助出库软件',
  '抖店',
  '抖店gemini建议',
  '抖店机器人',
  '抖店聊天记录导出',
];
const manifestReport = [];
for (const dir of manifestDirs) {
  const file = path.join(scanRoot, dir, 'zhubo-control.manifest.json');
  if (!fs.existsSync(file)) {
    console.error('FAIL: manifest missing', file);
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!m.riskLevel) {
    console.error('FAIL: manifest without riskLevel', dir, m.code);
    process.exit(1);
  }
  const expected = DEFAULT_RISK_BY_CODE[m.code];
  if (expected && m.riskLevel !== expected) {
    console.error('FAIL: riskLevel mismatch', dir, m.code, 'got', m.riskLevel, 'want', expected);
    process.exit(1);
  }
  manifestReport.push({ dir, code: m.code, riskLevel: m.riskLevel });
}

// --- 线上 steward API（CONTROL_BASE；401 表示路由已部署需登录） ---
const base = (process.env.CONTROL_BASE || 'http://8.137.126.18/control').replace(/\/$/, '');

async function apiFetch(pathname, opts = {}) {
  const res = await fetch(`${base}${pathname}`, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

const online = await (async () => {
  const endpoints = {};
  const checks = [
    ['health', '/api/health', 'GET'],
    ['gitStatus', '/api/steward/git-status', 'GET'],
    ['backups', '/api/steward/backups', 'GET'],
    ['deployments', '/api/steward/deployments', 'GET'],
    ['tasks', '/api/steward/tasks', 'GET'],
    ['deployGate', '/api/steward/deployments/check-gate', 'POST'],
  ];
  for (const [key, pathname, method] of checks) {
    const r = await apiFetch(pathname, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: method === 'POST' ? JSON.stringify({}) : undefined,
    });
    endpoints[key] = { status: r.status, ok: r.status !== 404, authRequired: r.status === 401 };
    if (r.status === 404) {
      console.error('FAIL: steward endpoint 404', pathname);
      process.exit(1);
    }
  }
  for (const [key, pathname] of [
    ['workdayStart', '/api/steward/workday/start'],
    ['workdayEnd', '/api/steward/workday/end'],
  ]) {
    const r = await apiFetch(pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smoke: true }),
    });
    endpoints[key] = { status: r.status, ok: r.status !== 404, authRequired: r.status === 401 };
    if (r.status === 404) {
      console.error('FAIL: steward endpoint 404', pathname);
      process.exit(1);
    }
  }
  return { skipped: false, endpoints };
})();

console.log(
  JSON.stringify(
    {
      ok: true,
      gitFilter: { safe: blocked.safe.length, blocked: blocked.blocked.length },
      manifestCount: manifestReport.length,
      manifests: manifestReport,
      online,
    },
    null,
    2,
  ),
);
