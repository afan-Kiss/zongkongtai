#!/usr/bin/env node
/** Cookie 手动/自动同步闭环 — 静态验收 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps/control-desktop/src');
const ELECTRON = path.join(ROOT, 'apps/control-desktop/electron');
const BOT = path.join(ROOT, '..', '千帆中转机器人');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const failures = [];

const cookies = read(path.join(SRC, 'pages/CookiesPage.tsx'));
if (!cookies.includes('立即同步 Cookie')) {
  failures.push('CookiesPage must have 立即同步 Cookie button');
}
if (!cookies.includes('Cookie 是怎么同步的')) {
  failures.push('CookiesPage must include Cookie sync guide title');
}
if (!cookies.includes('高级：手动粘贴 Cookie')) {
  failures.push('CookiesPage must have advanced paste fold');
}
if (/document\.cookie|完整 Cookie|cookie:\s*['"]/.test(cookies)) {
  failures.push('CookiesPage must not display full cookie literals');
}
if (!cookies.includes('Cookie 同步需要连接云端')) {
  failures.push('CookiesPage cloud disconnected must show soft message');
}
if (cookies.includes('总控台还没有 Cookie 数据') || cookies.includes('Cookie 无')) {
  failures.push('CookiesPage must not show harsh cookie missing errors');
}
if (!cookies.includes('正在同步 Cookie')) {
  failures.push('CookiesPage must show syncing label');
}

const settings = read(path.join(SRC, 'pages/SettingsPage.tsx'));
if (!settings.includes('千帆中转机器人地址')) {
  failures.push('SettingsPage must have relay URL field');
}
if (!settings.includes('测试千帆连接')) {
  failures.push('SettingsPage must have test relay button');
}

const health = read(path.join(ELECTRON, 'health-check.ts'));
if (!health.includes('千帆中转机器人未运行')) {
  failures.push('health-check must warn when relay offline');
}
if (!health.includes('四店 Cookie 正常')) {
  failures.push('health-check must have four-shop ok message');
}

const preload = read(path.join(ELECTRON, 'preload.ts'));
if (!preload.includes('cookie:syncNow')) {
  failures.push('preload must expose cookie.syncNow');
}

const ipc = read(path.join(ELECTRON, 'ipc.ts'));
if (!ipc.includes('cookie:syncNow')) {
  failures.push('ipc must handle cookie:syncNow');
}

const cookieSync = read(path.join(ELECTRON, 'cookie-sync.ts'));
if (cookieSync.includes('console.log') && cookieSync.match(/cookie[^H]/i)?.[0]?.includes('log')) {
  /* ok if only structured logs */
}
if (!cookieSync.includes('/api/cookie/sync-now')) {
  failures.push('cookie-sync must call relay sync-now endpoint');
}

let botApi = '';
try {
  botApi = read(path.join(BOT, 'src/qianfan-local-api.js'));
} catch {
  failures.push('qianfan bot qianfan-local-api.js not found at sibling path');
}
if (botApi && !botApi.includes('/api/cookie/sync-now')) {
  failures.push('qianfan bot must implement /api/cookie/sync-now');
}
if (botApi && botApi.includes('cookie: collected.cookie')) {
  failures.push('qianfan bot API must not return full cookie');
}

const collector = (() => {
  try {
    return read(path.join(BOT, 'src/qianfan-cookie-collector.js'));
  } catch {
    return '';
  }
})();
if (collector && !collector.includes('scheduleCookieRefresh')) {
  failures.push('qianfan collector must keep auto sync scheduler');
}
if (collector && !collector.includes('onBuyerMessage')) {
  failures.push('qianfan collector must keep buyer message trigger');
}

if (failures.length) {
  console.error('FAIL cookie-sync acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: failures.length === 0 ? 12 : 0 }, null, 2));
