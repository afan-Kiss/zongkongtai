#!/usr/bin/env node
/** push 后复查 GitHub raw main — 多行格式 + ipc 无旧 handler */
const RAW_BASE = 'https://raw.githubusercontent.com/afan-Kiss/zongkongtai/main/';

const CORE = {
  'package.json': 8,
  'README.md': 15,
  'apps/control-desktop/electron/ipc.ts': 100,
  'apps/control-desktop/electron/preload.ts': 50,
  'apps/control-desktop/electron/config.ts': 30,
  'apps/control-desktop/src/stores/appStore.ts': 40,
  'apps/control-desktop/src/components/layout/Shell.tsx': 40,
};

const IPC_FORBIDDEN = [
  "ipcMain.handle('cloud:",
  'ipcMain.handle("cloud:',
  "ipcMain.handle('agent:",
  'ipcMain.handle("agent:',
  "ipcMain.handle('workspace:",
  'ipcMain.handle("workspace:',
  'steward:backups',
  'steward:deployments',
  'steward:tasks',
  'steward:workdayStart',
  'REMOVED_FEATURE',
  'cloud:connect',
  'agent:status',
  'workspace:list',
];

const PRELOAD_FORBIDDEN = ['cloud:', 'cloud.', 'agent:', 'agent.', 'workspace:', 'cookie:', 'backups', 'deployments'];

async function fetchRaw(rel) {
  const url = RAW_BASE + rel.replace(/\\/g, '/');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

const failures = [];

let ipcText = '';
for (const [rel, minLines] of Object.entries(CORE)) {
  let text;
  try {
    text = await fetchRaw(rel);
  } catch (e) {
    failures.push(`fetch failed ${rel}: ${e.message}`);
    continue;
  }
  if (rel.endsWith('ipc.ts')) ipcText = text;
  const lines = text.split('\n');
  if (text.length > 80 && !text.includes('\n')) {
    failures.push(`${rel} raw must contain LF newlines`);
  }
  if (lines.length <= 1 && text.length > 80) {
    failures.push(`${rel} raw must not be single-line (got ${lines.length})`);
  }
  if (lines.length < minLines && text.length > 80) {
    failures.push(`${rel} raw must have >= ${minLines} lines (got ${lines.length})`);
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 2000) failures.push(`${rel} raw line ${i + 1} > 2000 chars`);
  }
}

if (ipcText) {
  for (const needle of IPC_FORBIDDEN) {
    if (ipcText.includes(needle)) failures.push(`ipc.ts raw must not contain ${needle}`);
  }
}

let preloadText = '';
try {
  preloadText = await fetchRaw('apps/control-desktop/electron/preload.ts');
} catch (e) {
  failures.push(`fetch preload failed: ${e.message}`);
}
if (preloadText) {
  for (const needle of PRELOAD_FORBIDDEN) {
    if (preloadText.includes(needle)) failures.push(`preload.ts raw must not expose ${needle}`);
  }
}

if (failures.length) {
  console.error('FAIL verify-github-raw-main:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      base: RAW_BASE,
      ipcLines: ipcText.split('\n').length,
      preloadLines: preloadText.split('\n').length,
      checks: Object.keys(CORE).length + IPC_FORBIDDEN.length,
    },
    null,
    2,
  ),
);
