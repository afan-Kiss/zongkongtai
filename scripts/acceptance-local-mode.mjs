#!/usr/bin/env node
/** 本地模式优先 — 静态验收 */
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

const shell = read(path.join(SRC, 'components/layout/Shell.tsx'));
if (shell.includes('用户名或密码错误')) {
  failures.push('TopBar must not show 用户名或密码错误');
}
if (shell.includes('Cookie 无') || /text:\s*['"]无['"]/.test(shell)) {
  if (/label:\s*['"]Cookie['"][\\s\\S]{0,120}['"]无['"]/.test(shell)) {
    failures.push('TopBar must not show Cookie 无');
  }
}
if (!shell.includes('本地模式')) failures.push('TopBar must show 本地模式');
if (!shell.includes('未连接') && !read(path.join(SRC, 'lib/cloudStatus.ts')).includes('未连接')) {
  failures.push('TopBar must show 未连接 for cloud offline');
}
if (shell.includes("label: 'Agent'") || shell.includes('label: "Agent"')) {
  failures.push('TopBar must not show Agent label with auth errors');
}

const overview = read(path.join(SRC, 'pages/OverviewPage.tsx'));
if (overview.includes('用户名或密码错误')) {
  failures.push('OverviewPage must not show 用户名或密码错误');
}
if (!overview.includes('本地总控')) failures.push('OverviewPage must have 本地总控 card');
if (!overview.includes('云端同步')) failures.push('OverviewPage must have 云端同步 card');

const cookies = read(path.join(SRC, 'pages/CookiesPage.tsx'));
if (!cookies.includes('Cookie 同步需要连接云端')) {
  failures.push('CookiesPage disconnected must show cloud required message');
}
if (cookies.includes('总控台还没有 Cookie 数据')) {
  failures.push('CookiesPage must not show 总控台还没有 Cookie 数据');
}
if (!cookies.includes('Cookie 是怎么同步的')) {
  failures.push('CookiesPage must include Cookie sync guide');
}

const settings = read(path.join(SRC, 'pages/SettingsPage.tsx'));
if (!settings.includes('云端连接（可选）')) {
  failures.push('SettingsPage must show 云端连接（可选）');
}
if (!settings.includes('本地项目管理、Git 上传、终端不需要云端登录')) {
  failures.push('SettingsPage must explain local features need no cloud');
}
if (!settings.includes('测试连接')) failures.push('SettingsPage must have 测试连接 button');

const bootstrap = read(path.join(SRC, 'hooks/useCloudBootstrap.ts'));
if (!bootstrap.includes('projects.loadLocal')) {
  failures.push('useCloudBootstrap must load local projects first');
}
if (/setProjects\(\[\]\)/.test(bootstrap)) {
  failures.push('useCloudBootstrap must not setProjects([]) on cloud fail');
}

const healthCheck = read(path.join(ELECTRON, 'health-check.ts'));
if (!healthCheck.includes('runHealthCheckSimple')) {
  failures.push('health-check must define runHealthCheckSimple');
}
if (!healthCheck.includes('云端未连接，不影响本地功能')) {
  failures.push('health-check cloud optional must use warn message');
}

const healthPage = read(path.join(SRC, 'pages/HealthPage.tsx'));
if (!healthPage.includes('local_manifest')) {
  failures.push('HealthPage must include local_manifest in simple ids');
}

const ipc = read(path.join(ELECTRON, 'ipc.ts'));
if (!ipc.includes('projects:loadLocal')) failures.push('ipc must expose projects:loadLocal');
if (!ipc.includes('loadLocalProjectsFromManifests')) {
  failures.push('ipc git:list must fallback to local projects');
}

const preload = read(path.join(ELECTRON, 'preload.ts'));
if (!preload.includes('loadLocal')) failures.push('preload must expose projects.loadLocal');

const mainNavForbidden = ['工作区', '备份回滚', '部署记录', '后台任务', '窗口管理', '端口', '关于'];
for (const label of mainNavForbidden) {
  const inMainNav = new RegExp(`MAIN_NAV[\\s\\S]*label:\\s*['"]${label}['"]`).test(shell);
  if (inMainNav) failures.push(`Shell MAIN_NAV must not include ${label}`);
}

if (failures.length) {
  console.error('FAIL local mode acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 20 }, null, 2));
