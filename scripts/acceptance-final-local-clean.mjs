#!/usr/bin/env node
/** 最终本地纯净验收 */
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
const config = readAbs(path.join(ELECTRON, 'config.ts'));
const bootstrap = readAbs(path.join(SRC, 'hooks/useLocalBootstrap.ts'));
const overview = readAbs(path.join(SRC, 'pages/OverviewPage.tsx'));
const settings = readAbs(path.join(SRC, 'pages/SettingsPage.tsx'));
const shell = readAbs(path.join(SRC, 'components/layout/Shell.tsx'));
const readme = read('README.md');

const activeElectron = [
  'electron/ipc.ts',
  'electron/preload.ts',
  'electron/config.ts',
  'electron/health-check.ts',
  'electron/process-manager.ts',
  'electron/port-conflict-analyzer.ts',
  'electron/main.ts',
].map((f) => readAbs(path.join(DESKTOP, f)));

if (activeElectron.some((s) => /import\s+.*cloudClient/.test(s))) {
  failures.push('active electron must not import cloudClient');
}
if (ipc.includes('cloudClient.ensureLogin')) {
  failures.push('ipc.ts must not call cloudClient.ensureLogin');
}
if (/cloudClient\.project/.test(ipc)) {
  failures.push('process handlers must not call cloudClient.project');
}

if (preload.includes('cloud:')) failures.push('preload must not expose cloud API');
if (preload.includes('secrets')) failures.push('preload must not expose secrets');
if (preload.includes('agent:')) failures.push('preload must not expose agent API');
if (preload.includes('workspace:')) failures.push('preload must not expose workspace API');
if (preload.includes('backups')) failures.push('preload must not expose backups');
if (preload.includes('deployments')) failures.push('preload must not expose deployments');

for (const key of [
  'adminPassword',
  'agentToken',
  'serviceToken',
  'controlServerUrl',
  'deploy-output-credentials',
]) {
  if (config.includes(key)) failures.push(`config.ts must not contain ${key}`);
}

if (overview.includes('git.list')) failures.push('OverviewPage must not auto git.list');
if (bootstrap.includes('30000')) failures.push('useLocalBootstrap must not use 30s interval for full refresh');
if (bootstrap.includes('loadLocal') && /setInterval[\s\S]{0,200}loadLocal/.test(bootstrap)) {
  failures.push('useLocalBootstrap must not periodically loadLocal');
}
if (bootstrap.includes('ports.analyze') && /setInterval[\s\S]{0,300}ports\.analyze/.test(bootstrap)) {
  failures.push('useLocalBootstrap must not periodically ports.analyze');
}
if (!bootstrap.includes('60000')) failures.push('useLocalBootstrap should poll external-running every 60s');

const navCount = (shell.match(/id:\s*'/g) || []).length;
if (navCount !== 7) failures.push(`Shell must have 7 nav items, found ${navCount}`);

if (settings.includes('管理员账号') || settings.includes('管理员密码') || settings.includes('Token')) {
  failures.push('Settings must not have account/password/token fields');
}
if (fs.existsSync(path.join(SRC, 'pages/CookiesPage.tsx'))) {
  failures.push('CookiesPage must not exist');
}
if (!/纯本地|本地工具/.test(readme)) failures.push('README must state local-only');

const coreFiles = [
  'apps/control-desktop/electron/ipc.ts',
  'apps/control-desktop/electron/preload.ts',
  'apps/control-desktop/electron/config.ts',
  'apps/control-desktop/electron/start-command.ts',
  'apps/control-desktop/electron/external-project-status.ts',
  'apps/control-desktop/electron/external-process-stop.ts',
  'apps/control-desktop/src/stores/appStore.ts',
  'apps/control-desktop/src/hooks/useLocalBootstrap.ts',
  'package.json',
];
for (const rel of coreFiles) {
  const content = read(rel);
  if (content.split('\n').length <= 1 && content.length > 80) {
    failures.push(`${rel} must not be single-line`);
  }
}

const stopMod = readAbs(path.join(ELECTRON, 'external-process-stop.ts'));
if (!stopMod.includes('explorer')) failures.push('external-process-stop must protect explorer');
if (!stopMod.includes('nginx')) failures.push('external-process-stop must protect nginx');

const startCmd = readAbs(path.join(ELECTRON, 'start-command.ts'));
if (!startCmd.includes('resolveManifestStartCommand')) {
  failures.push('start-command must use manifest only');
}

const procMgr = readAbs(path.join(ELECTRON, 'process-manager.ts'));
if (!procMgr.includes('9323/api/health')) {
  failures.push('qianfan startup must check 9323 health');
}

if (failures.length) {
  console.error('FAIL final-local-clean acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 16 }, null, 2));
