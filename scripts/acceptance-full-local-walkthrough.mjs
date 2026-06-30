#!/usr/bin/env node
/** 本地总控全流程静态验收 — 7 页导航、无云端/Cookie、稳定刷新策略 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DESKTOP = path.join(ROOT, 'apps/control-desktop');
const SRC = path.join(DESKTOP, 'src');
const ELECTRON = path.join(DESKTOP, 'electron');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readAbs(abs) {
  return fs.readFileSync(abs, 'utf8');
}

const failures = [];

const ipc = readAbs(path.join(ELECTRON, 'ipc.ts'));
const preload = readAbs(path.join(ELECTRON, 'preload.ts'));
const bootstrap = readAbs(path.join(SRC, 'hooks/useLocalBootstrap.ts'));
const overview = readAbs(path.join(SRC, 'pages/OverviewPage.tsx'));
const projects = readAbs(path.join(SRC, 'pages/ProjectsPage.tsx'));
const gitPage = readAbs(path.join(SRC, 'pages/GitPage.tsx'));
const settings = readAbs(path.join(SRC, 'pages/SettingsPage.tsx'));
const shell = readAbs(path.join(SRC, 'components/layout/Shell.tsx'));
const appTsx = readAbs(path.join(SRC, 'App.tsx'));
const healthCheck = readAbs(path.join(ELECTRON, 'health-check.ts'));
const procMgr = readAbs(path.join(ELECTRON, 'process-manager.ts'));
const stopMod = readAbs(path.join(ELECTRON, 'external-process-stop.ts'));
const extStatus = readAbs(path.join(ELECTRON, 'external-project-status.ts'));
const startCmd = readAbs(path.join(ELECTRON, 'start-command.ts'));
const readme = read('README.md');
const gitignore = read('.gitignore');
const pkg = read('package.json');

// 1–4 主导航与禁用菜单
const navCount = (shell.match(/id:\s*'/g) || []).length;
if (navCount !== 7) failures.push(`Shell must have 7 nav items, found ${navCount}`);
if (/Cookie|cookies/i.test(shell)) failures.push('Shell must not mention Cookie menu');
if (/云端|cloud/i.test(shell)) failures.push('Shell must not mention cloud menu');

// 5 设置页无账号密码 Token
for (const needle of ['管理员账号', '管理员密码', 'Service Token', 'Agent Token', '测试云端']) {
  if (settings.includes(needle)) failures.push(`Settings must not contain: ${needle}`);
}

// 6–7 总览/项目页不自动 git.list
if (overview.includes('git.list')) failures.push('OverviewPage must not call git.list');
if (/useEffect[\s\S]{0,400}git\.list/.test(projects)) {
  failures.push('ProjectsPage must not auto git.list on mount');
}

// 8 Git 页允许刷新
if (!gitPage.includes('git.list')) failures.push('GitPage must call git.list');

// 9–10 bootstrap 不 30 秒扫项目/端口
if (bootstrap.includes('30000')) failures.push('useLocalBootstrap must not use 30s interval');
if (/setInterval[\s\S]{0,250}loadLocal/.test(bootstrap)) {
  failures.push('useLocalBootstrap must not periodically loadLocal');
}
if (/setInterval[\s\S]{0,250}ports\.analyze/.test(bootstrap)) {
  failures.push('useLocalBootstrap must not periodically ports.analyze');
}
if (/portConflictIgnoredIds/.test(bootstrap)) {
  failures.push('useLocalBootstrap must not re-bootstrap on portConflictIgnoredIds');
}
if (!bootstrap.includes('60000')) failures.push('useLocalBootstrap should poll external every 60s');

// 11 process:restart 不调用 cloudClient
if (/cloudClient/.test(procMgr)) failures.push('process-manager must not use cloudClient');

// 12 ipc/preload 不暴露 cloud / agent / workspace / backups / deployments
for (const [name, content] of [
  ['preload', preload],
  ['ipc', ipc],
]) {
  if (/cloud:/.test(content)) failures.push(`${name} must not expose cloud IPC channels`);
  if (/agent:/.test(content)) failures.push(`${name} must not expose agent IPC channels`);
  if (/workspace:/.test(content)) failures.push(`${name} must not expose workspace IPC channels`);
}
if (preload.includes('backups') || preload.includes('deployments')) {
  failures.push('preload must not expose backups/deployments');
}

// 13 Cookie 页面不存在
if (fs.existsSync(path.join(SRC, 'pages/CookiesPage.tsx'))) {
  failures.push('CookiesPage must not exist');
}

// 14 health-check 简单模式不检查云端/Cookie/Agent
for (const needle of ['cloudClient', 'ensureLogin', 'CONTROL_SERVER', '8.137.126.18']) {
  if (healthCheck.includes(needle)) {
    failures.push(`health-check must not reference ${needle}`);
  }
}
if (!/纯本地|不含 Cookie/.test(healthCheck)) {
  failures.push('health-check simple mode must be documented as local-only');
}
const simpleBlock = healthCheck.match(
  /export async function runHealthCheckSimple[\s\S]*?return summarize\(items\);/,
);
if (simpleBlock) {
  const body = simpleBlock[0];
  for (const bad of ['checkCloudHealth', 'checkAgentSimple', 'checkCloudOptional', 'checkCookie']) {
    if (body.includes(bad)) failures.push(`runHealthCheckSimple must not call ${bad}`);
  }
}

// 15 端口冲突入口
if (!shell.includes('setPortConflictOpen') && !overview.includes('setPortConflictOpen')) {
  failures.push('must have port conflict dialog entry');
}

// 16 external-running
if (!extStatus.includes('external-running')) {
  failures.push('external-project-status must define external-running');
}
if (!extStatus.includes('9323')) failures.push('qianfan must check 9323 health');

// 17 stopExternal 保护名单
for (const prot of ['nginx', 'x-ui', 'zhubo-analysis', 'explorer', 'chrome']) {
  if (!stopMod.includes(prot)) failures.push(`external-process-stop must protect ${prot}`);
}

// 18 start-command manifest only
if (!startCmd.includes('resolveManifestStartCommand')) {
  failures.push('start-command must use manifest only');
}

// 19–21 核心源码多行
const MIN_LINES = {
  'apps/control-desktop/electron/ipc.ts': 80,
  'apps/control-desktop/electron/preload.ts': 40,
  'apps/control-desktop/src/App.tsx': 30,
  'package.json': 5,
  'README.md': 10,
};
for (const [rel, min] of Object.entries(MIN_LINES)) {
  const content = read(rel);
  const lines = content.split('\n');
  if (lines.length < min && content.length > 80) {
    failures.push(`${rel} must have at least ${min} lines (got ${lines.length})`);
  }
  if (lines.length <= 1 && content.length > 80) {
    failures.push(`${rel} must not be single-line`);
  }
}

// 22 build/pack 产物不进 Git
for (const needle of ['dist-desktop', 'win-unpacked', 'node_modules']) {
  if (!gitignore.includes(needle)) failures.push(`.gitignore must ignore ${needle}`);
}

// 旧路由回退总览
if (!appTsx.includes('OverviewPage')) failures.push('App must fallback unknown routes to OverviewPage');
if (!/LEGACY_FALLBACK|cookies.*OverviewPage|backup.*OverviewPage/.test(appTsx)) {
  failures.push('App must map legacy routes to OverviewPage');
}

// README 纯本地
if (!/纯本地|本地工具/.test(readme)) failures.push('README must state local-only');

// package.json 脚本存在
if (!pkg.includes('control:acceptance-full-local-walkthrough')) {
  failures.push('package.json must define control:acceptance-full-local-walkthrough');
}

if (failures.length) {
  console.error('FAIL full-local-walkthrough acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(
  JSON.stringify({ ok: true, checks: 22, navItems: navCount }, null, 2),
);
