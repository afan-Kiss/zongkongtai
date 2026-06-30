#!/usr/bin/env node
/** 本地单机版 — 静态验收 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps/control-desktop/src');
const ELECTRON = path.join(ROOT, 'apps/control-desktop/electron');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const failures = [];
const forbidden = [
  '云端总控',
  '云端同步',
  '云端连接',
  '云端未连接',
  '用户名或密码错误',
  '管理员账号',
  '管理员密码',
  'Service Token',
  'Agent Token',
  'ADMIN_PASSWORD',
  '8.137.126.18/control',
];

function scanNoForbidden(label, text) {
  for (const word of forbidden) {
    if (text.includes(word)) failures.push(`${label} must not contain "${word}"`);
  }
}

const uiFiles = [
  ['Shell', path.join(SRC, 'components/layout/Shell.tsx')],
  ['Overview', path.join(SRC, 'pages/OverviewPage.tsx')],
  ['Settings', path.join(SRC, 'pages/SettingsPage.tsx')],
  ['Cookies', path.join(SRC, 'pages/CookiesPage.tsx')],
  ['Health', path.join(SRC, 'pages/HealthPage.tsx')],
];

for (const [label, file] of uiFiles) {
  scanNoForbidden(label, read(file));
}

const settings = read(path.join(SRC, 'pages/SettingsPage.tsx'));
if (!settings.includes('扫描根目录')) failures.push('Settings must have scan root');
if (!settings.includes('千帆中转机器人地址')) failures.push('Settings must have relay URL');
if (!settings.includes('本地数据')) failures.push('Settings must have local data section');

const cookies = read(path.join(SRC, 'pages/CookiesPage.tsx'));
if (!cookies.includes('立即同步 Cookie')) failures.push('Cookies must have sync button');
if (cookies.includes('连接云端')) failures.push('Cookies must not mention 连接云端');

const electronFiles = read(path.join(ELECTRON, 'local-cookie-store.ts'));
if (!electronFiles.includes('encryptedValue')) failures.push('local cookie store required');

const ipc = read(path.join(ELECTRON, 'ipc.ts'));
if (!ipc.includes('local-cookie-store')) failures.push('ipc must use local cookie store');
if (!ipc.includes('findLocalProjectById')) failures.push('ipc must resolve local projects');

const readme = read(path.join(ROOT, 'README.md'));
if (readme.includes('正式云端总控')) failures.push('README must not mention 正式云端总控');
if (!readme.includes('珠宝本地总控')) failures.push('README must describe local product');

const pkg = read(path.join(ROOT, 'package.json'));
if (pkg.includes('deploy:aliyun')) failures.push('package.json must not list deploy:aliyun as main script');
if (!pkg.includes('control:acceptance-local-only')) failures.push('package.json must have acceptance-local-only');

const bootstrap = read(path.join(SRC, 'hooks/useLocalBootstrap.ts'));
if (!bootstrap.includes('projects.loadLocal')) failures.push('useLocalBootstrap must load local projects');

if (failures.length) {
  console.error('FAIL local-only acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 13 }, null, 2));
