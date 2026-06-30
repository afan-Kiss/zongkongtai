#!/usr/bin/env node
/** 端口冲突体验 — 静态验收 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps/control-desktop/src');
const ELECTRON = path.join(ROOT, 'apps/control-desktop/electron');
const SHARED = path.join(ROOT, 'packages/control-shared/src');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const failures = [];

const shell = read(path.join(SRC, 'components/layout/Shell.tsx'));
if (!shell.includes('setPortConflictOpen(true)')) {
  failures.push('Shell TopBar must open port conflict dialog on click');
}
if (!/item\.clickable|clickable:/.test(shell)) {
  failures.push('Shell TopBar port item must be clickable when conflicts exist');
}

const dialogPath = path.join(SRC, 'components/PortConflictDialog.tsx');
if (!fs.existsSync(dialogPath)) {
  failures.push('PortConflictDialog component missing');
} else {
  const dialog = read(dialogPath);
  for (const needle of [
    '端口冲突处理',
    '这些端口可能被多个项目登记',
    '重新检测',
    '关闭旧进程',
    'window.confirm',
    'duplicate_registration',
    'config_conflict',
    'real_occupation',
  ]) {
    if (!dialog.includes(needle)) failures.push(`PortConflictDialog missing ${needle}`);
  }
  if (!dialog.includes('safeToKill')) {
    failures.push('PortConflictDialog must gate kill button on safeToKill');
  }
}

const shared = read(path.join(SHARED, 'portConflict.ts'));
if (!shared.includes('duplicate_registration') || !shared.includes('config_conflict')) {
  failures.push('portConflict.ts must classify conflict types');
}
if (!shared.includes('recommendFreePorts')) {
  failures.push('portConflict.ts missing recommendFreePorts');
}
for (const bad of [5173, 3000, 3001, 7890, 8080, 4723, 4725, 4726, 4790, 4791]) {
  if (!shared.includes(String(bad))) {
    failures.push(`portConflict.ts must avoid recommending port ${bad}`);
  }
}

const appStore = read(path.join(SRC, 'stores/appStore.ts'));
if (!appStore.includes('portConflictAnalysis') || !appStore.includes('seriousCount')) {
  failures.push('appStore must store portConflictAnalysis with seriousCount');
}

const dedup = read(path.join(SRC, 'lib/projectDedup.ts'));
if (!dedup.includes('hasDuplicatePortRegistration')) {
  failures.push('projectDedup must expose hasDuplicatePortRegistration');
}

const card = read(path.join(SRC, 'components/ProjectCard.tsx'));
if (!card.includes('hasDuplicatePortRegistration') || !card.includes('已去重显示')) {
  failures.push('ProjectCard must dedupe ports and show tooltip');
}

const healthPage = read(path.join(SRC, 'pages/HealthPage.tsx'));
if (!healthPage.includes('dialog:portConflicts')) {
  failures.push('HealthPage must open port conflict dialog from health item');
}

const healthCheck = read(path.join(ELECTRON, 'health-check.ts'));
if (!healthCheck.includes('analyzePortConflictsAsync')) {
  failures.push('health-check must use unified port conflict analysis');
}
if (!healthCheck.includes("id: 'ports'")) {
  failures.push('health-check port item id must be ports');
}

const ipc = read(path.join(ELECTRON, 'ipc.ts'));
if (!ipc.includes("'ports:analyze'")) failures.push('ipc missing ports:analyze');
if (!ipc.includes("'ports:safeKill'")) failures.push('ipc missing ports:safeKill');
if (!ipc.includes('manifest:dedupePortsApply')) {
  failures.push('ipc missing manifest dedupe ports handlers');
}

const preload = read(path.join(ELECTRON, 'preload.ts'));
if (!preload.includes('analyze:') || !preload.includes('safeKill:')) {
  failures.push('preload must expose ports.analyze and ports.safeKill');
}

const mainNavForbidden = ['工作区', '备份回滚', '部署记录', '后台任务', '窗口管理', '端口', '关于'];
for (const label of mainNavForbidden) {
  const inMainNav = new RegExp(`MAIN_NAV[\\s\\S]*label:\\s*['"]${label}['"]`).test(shell);
  if (inMainNav) failures.push(`Shell MAIN_NAV must not include ${label}`);
}

if (failures.length) {
  console.error('FAIL port conflicts acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 12 }, null, 2));
