#!/usr/bin/env node
/** EXE 性能与卡顿回归 — 静态扫描 + 结构检查 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'apps/control-desktop/electron');
const SRC = path.join(ROOT, 'apps/control-desktop/src');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function walkTs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, out);
    else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

const failures = [];

// 1. 禁止 sync exec 于 git/port/health 核心文件
const syncForbidden = walkTs(ELECTRON).filter(
  (f) =>
    !f.endsWith('config.ts') &&
    !f.endsWith('async-exec.ts'),
);
for (const file of syncForbidden) {
  const content = read(file);
  if (/execFileSync|execSync|spawnSync/.test(content)) {
    failures.push(`sync exec in ${path.relative(ROOT, file)}`);
  }
}

// 2. git:list 不含 fetch（默认）
const gitMgr = read(path.join(ELECTRON, 'git-manager.ts'));
if (!gitMgr.includes('fetchRemote?: boolean') || gitMgr.includes("['fetch', 'origin', branch")) {
  if (!gitMgr.includes('opts.fetchRemote')) {
    failures.push('git-manager missing fetchRemote gate');
  }
}

// 3. TaskManager
if (!fs.existsSync(path.join(ELECTRON, 'task-manager.ts'))) {
  failures.push('task-manager.ts missing');
}

// 4. workday 走 task
const ipc = read(path.join(ELECTRON, 'ipc.ts'));
for (const needle of [
  "startTask('steward:workdayStart'",
  "startTask('steward:workdayEnd'",
  "startTask('git:list'",
  "'steward:healthCheck'",
]) {
  if (!ipc.includes(needle)) failures.push(`ipc missing ${needle}`);
}

// 5. ports async
const portMgr = read(path.join(ELECTRON, 'port-manager.ts'));
if (!portMgr.includes('scanLocalPortsAsync')) failures.push('port-manager missing scanLocalPortsAsync');

// 6. App pages
const app = read(path.join(SRC, 'App.tsx'));
for (const p of ['git:', 'health:', 'backup:', 'deploy:', 'tasks:']) {
  if (!app.includes(p)) failures.push(`App.tsx missing page ${p}`);
}

// 7. Shell nav
const shell = read(path.join(SRC, 'components/layout/Shell.tsx'));
for (const label of ['Git 上传', '系统体检', '备份回滚', '部署记录', '后台任务']) {
  if (!shell.includes(label)) failures.push(`Shell missing ${label}`);
}

// 8. ProjectCard riskLevel
const card = read(path.join(SRC, 'components/ProjectCard.tsx'));
if (!card.includes('riskRequiresConfirm') || !card.includes('protected')) {
  failures.push('ProjectCard missing riskLevel gates');
}

// 9. HealthPage no auto full on mount
const healthPage = read(path.join(SRC, 'pages/HealthPage.tsx'));
if (!/useEffect\(\(\) => \{\s*loadLight\(\)/.test(healthPage)) {
  failures.push('HealthPage should mount with loadLight only');
}
if (!healthPage.includes('healthCheckLight')) failures.push('HealthPage missing light check');

// 10. inFlight / task
if (!read(path.join(SRC, 'pages/OverviewPage.tsx')).includes('workdayBusy')) {
  failures.push('OverviewPage missing workday inFlight guard');
}

// 11. forbidden url — gitRemote excluded
const forbidden = read(path.join(ELECTRON, 'forbidden-url.ts'));
if (!forbidden.includes('github.com')) failures.push('forbidden-url should allow github.com');
const healthCheck = read(path.join(ELECTRON, 'health-check.ts'));
if (!healthCheck.includes('scanManifestFileForbidden')) {
  failures.push('health-check should use scanManifestFileForbidden');
}
if (healthCheck.includes('FORBIDDEN_DOMAIN_RE')) {
  failures.push('health-check still uses FORBIDDEN_DOMAIN_RE whole-file scan');
}

// 12. ipc perf
if (!fs.existsSync(path.join(ELECTRON, 'ipc-perf.ts'))) failures.push('ipc-perf.ts missing');

if (failures.length) {
  console.error('FAIL desktop performance acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 12 }, null, 2));
