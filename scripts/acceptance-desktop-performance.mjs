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
  (f) => !f.endsWith('config.ts') && !f.endsWith('async-exec.ts'),
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

// 4. 关键任务走 TaskManager
const ipc = read(path.join(ELECTRON, 'ipc.ts'));
for (const needle of ["startTask('git:list'", "'steward:healthCheck'"]) {
  if (!ipc.includes(needle)) failures.push(`ipc missing ${needle}`);
}

// 5. ports async + preflight single scan
const portMgr = read(path.join(ELECTRON, 'port-manager.ts'));
if (!portMgr.includes('scanLocalPortsAsync'))
  failures.push('port-manager missing scanLocalPortsAsync');

const procMgr = read(path.join(ELECTRON, 'process-manager.ts'));
const preflightEarly = procMgr.slice(
  procMgr.indexOf('async preflight'),
  procMgr.indexOf('async start'),
);
if (!preflightEarly.includes('scanLocalPortsAsync(undefined, true)')) {
  failures.push('process-manager preflight must use single scanLocalPortsAsync');
}

// 6. App pages + global task bar
const app = read(path.join(SRC, 'App.tsx'));
for (const p of ['git:', 'health:', 'settings:', 'overview:']) {
  if (!app.includes(p)) failures.push(`App.tsx missing page ${p}`);
}
if (!app.includes('GlobalTaskBar')) failures.push('App.tsx missing GlobalTaskBar');
if (!app.includes('LEGACY_FALLBACK') && !app.includes('OverviewPage')) {
  failures.push('App.tsx must fallback legacy routes to OverviewPage');
}

// 7. Shell nav — 极简 7 项主导航
const shell = read(path.join(SRC, 'components/layout/Shell.tsx'));
const mainNavRequired = ['总览', '项目', 'Git 上传', '简单体检', '终端', 'Web 页面', '设置'];
for (const label of mainNavRequired) {
  if (!shell.includes(label)) failures.push(`Shell missing ${label}`);
}
if (shell.includes("'cookies'") || /label:\s*['"]Cookie['"]/.test(shell)) {
  failures.push('Shell MAIN_NAV must not include Cookie');
}
const mainNavForbidden = ['工作区', '备份回滚', '部署记录', '后台任务', '窗口管理', '端口', '关于'];
for (const label of mainNavForbidden) {
  const inMainNav = new RegExp(`MAIN_NAV[\\s\\S]*label:\\s*['"]${label}['"]`).test(shell);
  if (inMainNav) failures.push(`Shell MAIN_NAV must not include ${label}`);
}
if (shell.includes('提醒') || /warningCount/.test(shell)) {
  failures.push('TopBar must not show unreadable reminder badge');
}

// 7b. appStore global dedupe
const appStore = read(path.join(SRC, 'stores/appStore.ts'));
if (
  !/setProjects:\s*\(projects\)\s*=>\s*\{[\s\S]*deduplicateProjects/.test(appStore) &&
  !/setProjects:\s*\(projects\)\s*=>\s*set\(\{\s*projects:\s*deduplicateProjects/.test(appStore)
) {
  failures.push('appStore.setProjects must use deduplicateProjects');
}
const mainNavIds = shell.match(/id:\s*'[^']+'/g) || [];
if (mainNavIds.length !== 7) {
  failures.push(`Shell MAIN_NAV must have exactly 7 items, found ${mainNavIds.length}`);
}
const bootstrap = read(path.join(SRC, 'hooks/useLocalBootstrap.ts'));
if (!bootstrap.includes('refreshLocalProjects')) {
  failures.push('useLocalBootstrap must refresh local projects on start');
}
if (bootstrap.includes('portConflictIgnoredIds')) {
  failures.push('useLocalBootstrap must not depend on portConflictIgnoredIds');
}

// 8. ProjectCard — 总控自身不在卡片里启停
const card = read(path.join(SRC, 'components/ProjectCard.tsx'));
if (!card.includes('zhubo-control') || !card.includes('isSelfControlProject')) {
  failures.push('ProjectCard must guard self-control project start/stop');
}
if (card.includes('低风险') || card.includes('中风险') || card.includes('高风险')) {
  failures.push('ProjectCard must not show risk level badges');
}

// 9. HealthPage — manual start, no auto loadLight
const healthPage = read(path.join(SRC, 'pages/HealthPage.tsx'));
if (!healthPage.includes('开始简单体检') || !healthPage.includes('简单体检')) {
  failures.push('HealthPage must be simple health with manual start button');
}
if (
  healthPage.includes('系统体检') ||
  healthPage.includes('完整体检') ||
  healthPage.includes('轻量检查')
) {
  failures.push('HealthPage must not use complex health labels');
}
if (/useEffect\(\(\) => \{\s*loadLight/.test(healthPage)) {
  failures.push('HealthPage must not auto-run loadLight on mount');
}
if (/useEffect\(\(\) => \{\s*(loadLight|healthCheckLight)\(/.test(healthPage)) {
  failures.push('HealthPage should not auto-run healthCheckLight on mount');
}

// 10. OverviewPage simplified actions
const overview = read(path.join(SRC, 'pages/OverviewPage.tsx'));
if (!overview.includes('刷新状态') || !overview.includes('简单体检')) {
  failures.push('OverviewPage must have refresh and simple health buttons');
}
if (overview.includes('今日开工') || overview.includes('今日收工')) {
  failures.push('OverviewPage must not show workday start/end');
}

// 10b. ErrorBoundary prevents full-app black screen
const appTsx = read(path.join(SRC, 'App.tsx'));
if (!appTsx.includes('ErrorBoundary') || !appTsx.includes('PageErrorBoundary')) {
  failures.push('App must wrap pages with ErrorBoundary');
}
const forbidden = read(path.join(ELECTRON, 'forbidden-url.ts'));
if (!forbidden.includes('GIT_REMOTE_KEYS')) failures.push('forbidden-url missing GIT_REMOTE_KEYS');
if (!forbidden.includes('gitRemote')) failures.push('forbidden-url should allow gitRemote github');
if (!forbidden.includes('https://github.com')) {
  failures.push('forbidden-url should reference github.com block for runtime');
}
const healthCheck = read(path.join(ELECTRON, 'health-check.ts'));
if (!healthCheck.includes('scanManifestFileForbidden')) {
  failures.push('health-check should use scanManifestFileForbidden');
}
if (healthCheck.includes('FORBIDDEN_DOMAIN_RE')) {
  failures.push('health-check still uses FORBIDDEN_DOMAIN_RE whole-file scan');
}

// 12. ipc perf wrap on key handlers
if (!fs.existsSync(path.join(ELECTRON, 'ipc-perf.ts'))) failures.push('ipc-perf.ts missing');
const keyIpc = [
  'git:list',
  'git:commitPush',
  'git:pull',
  'steward:healthCheck',
  'ports:local',
  'ports:analyze',
  'manifest:scanLocal',
  'manifest:import',
  'projects:rescanDisk',
];
for (const ch of keyIpc) {
  const re = new RegExp(`ipcPerf\\(\\s*['"]${ch.replace(/:/g, '\\:')}['"]`);
  if (!re.test(ipc)) {
    failures.push(`ipc.ts missing ipcPerf wrap for ${ch}`);
  }
}

// 13. git commit/push dedup key matches task type
if (!ipc.includes('const taskType = `git:commitPush:${opts.localPath}`')) {
  failures.push('git:commitPush task type must include localPath');
}
if (!ipc.includes('const taskType = `git:pull:${localPath}`')) {
  failures.push('git:pull task type must include localPath');
}
if (!ipc.includes('这个 Git 操作正在进行中，请稍等。')) {
  failures.push('git duplicate guard message missing');
}

// 14. process:stop risk enforcement
if (!ipc.includes('resolveProjectForRisk')) {
  failures.push('process:stop must resolve project for risk');
}
if (!ipc.includes("assertRiskAllowed(payload, 'stop')")) {
  failures.push('process:stop must assertRiskAllowed');
}

// 13. useTaskRunner resolves all waiters (concurrent tasks)
const taskRunner = read(path.join(SRC, 'hooks/useTaskRunner.ts'));
if (
  taskRunner.includes('if (!isCurrent(t)) return') &&
  taskRunner.includes('waiters.current.get')
) {
  if (!taskRunner.includes('finishWaiter')) {
    failures.push('useTaskRunner must resolve waiters without blocking on activeId only');
  }
}

// 16. git:list no default --ignored
if (
  gitMgr.includes("['status', '--porcelain', '--ignored']") &&
  gitMgr.includes('getGitStatusForPath')
) {
  const statusFn = gitMgr.slice(
    gitMgr.indexOf('export async function getGitStatusForPath'),
    gitMgr.indexOf('export async function countGitIgnoredFiles'),
  );
  if (statusFn.includes('--ignored')) {
    failures.push('git:list getGitStatusForPath must not run --ignored by default');
  }
}
if (!gitMgr.includes('countGitIgnoredFiles')) {
  failures.push('git-manager missing countGitIgnoredFiles');
}

// 17. recursive manifest scan for git projects
if (!gitMgr.includes('listAllManifestEntries')) {
  failures.push('collectGitProjects must use listAllManifestEntries');
}

// 18. GitHub open via dedicated IPC
if (!gitMgr.includes('https://github.com/')) {
  failures.push('githubUrlFromRemote must return https://github.com/');
}
const ipcSecurity = read(path.join(ELECTRON, 'ipc-security.ts'));
if (!ipcSecurity.includes('assertAllowedGithubUrl')) {
  failures.push('ipc-security missing assertAllowedGithubUrl');
}
if (!ipc.includes('shell:openGithub')) failures.push('ipc missing shell:openGithub');
const gitPage = read(path.join(SRC, 'pages/GitPage.tsx'));
if (!/rows\.map\([\s\S]*一键上传/.test(gitPage)) {
  failures.push('GitPage project cards must include 一键上传 in rows.map');
}
if (!gitPage.includes('shell.openGithub')) {
  failures.push('GitPage must use shell.openGithub');
}

// 19. preflight single port scan
const preflightBlock = procMgr.slice(
  procMgr.indexOf('async preflight'),
  procMgr.indexOf('async start'),
);
if (!preflightBlock.includes('scanLocalPortsAsync(undefined, true)')) {
  failures.push('preflight must scan ports once via scanLocalPortsAsync');
}
if (preflightBlock.includes('isPortListeningAsync')) {
  failures.push('preflight must not call isPortListeningAsync per port');
}

// 20. GlobalTaskBar no refresh on every progress
const taskBar = read(path.join(SRC, 'components/GlobalTaskBar.tsx'));
if (taskBar.includes('onProgress(() => void refresh()')) {
  failures.push('GlobalTaskBar must not refresh on every progress');
}
if (!taskBar.includes('patchTask')) {
  failures.push('GlobalTaskBar must patch local state from task events');
}

// 21. runCommand output cap
const asyncExec = read(path.join(ELECTRON, 'async-exec.ts'));
if (!asyncExec.includes('MAX_OUTPUT_CHARS')) {
  failures.push('async-exec missing output length cap');
}

// 22. stopAll requires risk map
if (!procMgr.includes('stopAll 需要传入 projects 风险信息')) {
  failures.push('stopAll must require projects risk map');
}

// 23. processManager.stop requires risk meta; no bare single-arg calls
const bareStopRe = /processManager\.stop\s*\(\s*[^,)]+?\s*\)/g;
const bareStops = [...procMgr.matchAll(bareStopRe)].filter(
  (m) => !m[0].includes('stopUnsafeForInternalOnly'),
);
if (bareStops.length) {
  failures.push('processManager.stop must not be called with projectId only');
}
if (!procMgr.includes('stopUnsafeForInternalOnly')) {
  failures.push('processManager must expose stopUnsafeForInternalOnly for internal cleanup');
}
if (!procMgr.includes('projectRiskMeta')) {
  failures.push('processManager.stop must require projectRiskMeta');
}

const mainTs = read(path.join(ELECTRON, 'main.ts'));
if (!mainTs.includes('buildStopAllProjects')) {
  failures.push('main.ts must pass projects to stopAll');
}

const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
if (!pkg.scripts?.['pack:desktop:clean']) {
  failures.push('package.json missing pack:desktop:clean script');
}

const gitSecurity = read(path.join(ROOT, 'packages/control-shared/src/gitSecurity.ts'));
if (!gitSecurity.includes("'data'") || !gitSecurity.includes('运行数据目录 data')) {
  failures.push('gitSecurity must block data/ runtime dirs by default');
}

const gitMgrFull = read(path.join(ELECTRON, 'git-manager.ts'));
if (!gitMgrFull.includes('validateGitAddPaths') || !gitMgrFull.includes('[git-upload]')) {
  failures.push('git-manager must validate paths before git add with [git-upload] logs');
}
if (!/slice\(2\)\.trimStart\(\)/.test(gitMgrFull)) {
  failures.push('git-manager parsePorcelain must use slice(2).trimStart() to avoid ata/ bug');
}

const programCs = read(
  path.join(ROOT, 'apps/control-desktop/native-helper/Zhubo.NativeHelper/Program.cs'),
);
if (programCs.includes('MoveWindowNative') && programCs.includes('DllImport("user32.dll")')) {
  failures.push('native helper must not DllImport MoveWindowNative from user32.dll');
}
if (
  !programCs.includes('EntryPoint = "MoveWindow"') &&
  !/extern bool MoveWindow\(/.test(programCs)
) {
  failures.push('Program.cs must import user32 MoveWindow correctly');
}
if (!gitMgrFull.includes('finalizeGitCommitPaths')) {
  failures.push('git-manager must re-filter paths in finalizeGitCommitPaths before git add');
}

if (failures.length) {
  console.error('FAIL desktop performance acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 30 }, null, 2));
