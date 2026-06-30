#!/usr/bin/env node
/** 最终极简本地版 — 静态验收 */
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
  'Cookie 同步',
  '立即同步 Cookie',
  '手动粘贴 Cookie',
  'CookieStore',
  '管理员账号',
  '管理员密码',
  'Service Token',
  'Agent Token',
  'ADMIN_PASSWORD',
  '用户名或密码错误',
  '连接云端',
  '云端同步',
  '云端未连接',
  '8.137.126.18/control',
];

function scanNoForbidden(label, text, extra = forbidden) {
  for (const word of extra) {
    if (text.includes(word)) failures.push(`${label} must not contain "${word}"`);
  }
}

const shell = read(path.join(SRC, 'components/layout/Shell.tsx'));
const appStore = read(path.join(SRC, 'stores/appStore.ts'));
if (shell.includes("'cookies'") || shell.includes('Cookie')) {
  failures.push('Shell MAIN_NAV must not include Cookie');
}
if (/云端|Agent|cloudConnected/i.test(shell)) {
  failures.push('Shell must not show cloud/Agent top bar');
}
for (const key of ['cloudConnected', 'setCloud', 'setAgentStatus', 'agentStatus']) {
  if (appStore.includes(key)) failures.push(`appStore must not contain ${key}`);
}
const navCount = (shell.match(/id:\s*'/g) || []).length;
if (navCount !== 7) failures.push(`Shell MAIN_NAV must have 7 items, found ${navCount}`);

const settings = read(path.join(SRC, 'pages/SettingsPage.tsx'));
scanNoForbidden('Settings', settings);
if (!settings.includes('扫描根目录')) failures.push('Settings must have scan root');

const overview = read(path.join(SRC, 'pages/OverviewPage.tsx'));
scanNoForbidden('Overview', overview);
if (!overview.includes('本地总控')) failures.push('Overview must show local control status');
if (overview.includes('Cookie')) failures.push('Overview must not mention Cookie');

const health = read(path.join(SRC, 'pages/HealthPage.tsx'));
scanNoForbidden('HealthPage', health);
if (health.includes('qianfan_cookie') || health.includes('Cookie')) {
  failures.push('HealthPage must not check Cookie');
}

const preload = read(path.join(ELECTRON, 'preload.ts'));
if (preload.includes('cookie:') || preload.includes('cookie: {')) {
  failures.push('preload must not expose cookie API');
}

const ipc = read(path.join(ELECTRON, 'ipc.ts'));
if (
  ipc.includes('cookie:') ||
  ipc.includes('local-cookie-store') ||
  ipc.includes('local-control-api')
) {
  failures.push('ipc must not register cookie handlers or local cookie API');
}
if (ipc.includes('startLocalControlApi')) failures.push('ipc must not start local cookie API');

const main = read(path.join(ELECTRON, 'main.ts'));
if (main.includes('local-control-api') || main.includes('startLocalControlApi')) {
  failures.push('main must not start local cookie API');
}

for (const f of ['cookie-sync.ts', 'local-cookie-store.ts', 'local-control-api.ts']) {
  if (fs.existsSync(path.join(ELECTRON, f))) failures.push(`electron/${f} should be removed`);
}
if (fs.existsSync(path.join(SRC, 'pages/CookiesPage.tsx'))) {
  failures.push('CookiesPage should be removed');
}

const readme = read(path.join(ROOT, 'README.md'));
if (!readme.includes('Cookie 由千帆中转机器人')) {
  failures.push('README must state Cookie handled by qianfan bot');
}
if (readme.includes('cookie-store.json') || readme.includes('local-cookies/resolve')) {
  failures.push('README must not document local cookie store');
}

const pkg = read(path.join(ROOT, 'package.json'));
if (!pkg.includes('control:acceptance-minimal-local')) {
  failures.push('package.json must have control:acceptance-minimal-local');
}

if (!ipc.includes('git:commitPush')) failures.push('Git upload IPC must exist');
if (!ipc.includes('process:start')) failures.push('Project start IPC must exist');
if (!ipc.includes('ports:analyze')) failures.push('Port conflict IPC must exist');

if (failures.length) {
  console.error('FAIL minimal-local acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 13 }, null, 2));
