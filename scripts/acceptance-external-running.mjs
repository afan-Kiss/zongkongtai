#!/usr/bin/env node
/** 外部运行项目识别 — 静态验收 */
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

const card = read(path.join(SRC, 'components/ProjectCard.tsx'));
if (!card.includes('外部运行中')) {
  failures.push('ProjectCard must show 外部运行中 label');
}
if (!card.includes('已在外部运行')) {
  failures.push('ProjectCard must disable start for external-running');
}

const store = read(path.join(SRC, 'stores/appStore.ts'));
if (!store.includes('external-running')) {
  failures.push('appStore must count external-running in runningCount');
}
if (!store.includes('syncExternalRunning')) {
  failures.push('appStore must have syncExternalRunning');
}

const external = read(path.join(ELECTRON, 'external-project-status.ts'));
if (!external.includes('detectExternalProjectStatus')) {
  failures.push('detectExternalProjectStatus must exist');
}
if (!external.includes('9323/api/health')) {
  failures.push('qianfan must check 9323 /api/health');
}

const ipc = read(path.join(ELECTRON, 'ipc.ts'));
if (!ipc.includes('projects:detectExternalRunning')) {
  failures.push('ipc must expose projects:detectExternalRunning');
}
if (ipc.includes('cookie:') || ipc.includes('local-cookie-store')) {
  failures.push('must not restore cookie IPC');
}

const preload = read(path.join(ELECTRON, 'preload.ts'));
if (!preload.includes('detectExternalRunning')) {
  failures.push('preload must expose detectExternalRunning');
}
if (preload.includes('cookie:')) {
  failures.push('preload must not expose cookie API');
}

const shell = read(path.join(SRC, 'components/layout/Shell.tsx'));
const navCount = (shell.match(/id:\s*'/g) || []).length;
if (navCount !== 7) failures.push(`Shell must have 7 nav items, found ${navCount}`);
if (shell.includes("'cookies'")) failures.push('Shell must not include Cookie nav');

const settings = read(path.join(SRC, 'pages/SettingsPage.tsx'));
if (settings.includes('管理员账号') || settings.includes('管理员密码')) {
  failures.push('Settings must not have account/password fields');
}

if (fs.existsSync(path.join(SRC, 'pages/CookiesPage.tsx'))) {
  failures.push('CookiesPage must remain removed');
}

const health = read(path.join(ELECTRON, 'health-check.ts'));
if (!health.includes('外部运行项目识别')) {
  failures.push('health-check must include external running recognition');
}

if (failures.length) {
  console.error('FAIL external-running acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 10 }, null, 2));
