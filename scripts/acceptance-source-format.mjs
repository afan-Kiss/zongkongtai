#!/usr/bin/env node
/** 核心源码格式验收 — 多行、LF、行宽、关键安全逻辑 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const CORE_FILES = [
  'apps/control-desktop/electron/ipc.ts',
  'apps/control-desktop/electron/preload.ts',
  'apps/control-desktop/electron/config.ts',
  'apps/control-desktop/electron/start-command.ts',
  'apps/control-desktop/electron/external-project-status.ts',
  'apps/control-desktop/electron/external-process-stop.ts',
  'apps/control-desktop/electron/process-manager.ts',
  'apps/control-desktop/electron/local-projects.ts',
  'apps/control-desktop/electron/health-check.ts',
  'apps/control-desktop/electron/port-conflict-analyzer.ts',
  'apps/control-desktop/electron/git-manager.ts',
  'packages/control-shared/src/portConflict.ts',
  'packages/control-shared/src/gitSecurity.ts',
  'apps/control-desktop/src/stores/appStore.ts',
  'apps/control-desktop/src/hooks/useLocalBootstrap.ts',
  'apps/control-desktop/src/lib/localRefresh.ts',
  'apps/control-desktop/src/pages/OverviewPage.tsx',
  'apps/control-desktop/src/pages/SettingsPage.tsx',
  'apps/control-desktop/src/pages/HealthPage.tsx',
  'apps/control-desktop/src/pages/GitPage.tsx',
  'apps/control-desktop/src/components/ProjectCard.tsx',
  'apps/control-desktop/src/components/layout/Shell.tsx',
  'apps/control-desktop/src/components/PortConflictDialog.tsx',
  'apps/control-desktop/native-helper/Zhubo.NativeHelper/Program.cs',
  'scripts/acceptance-final-local-clean.mjs',
  'scripts/acceptance-port-conflicts.mjs',
  'scripts/acceptance-source-format.mjs',
  'scripts/acceptance-external-running.mjs',
  'scripts/acceptance-external-stop.mjs',
  'scripts/acceptance-start-command.mjs',
  'scripts/acceptance-overview-no-auto-git.mjs',
  'scripts/acceptance-minimal-local.mjs',
  'scripts/acceptance-full-local-walkthrough.mjs',
  '.gitattributes',
  '.gitignore',
  'package.json',
  'README.md',
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const MIN_LINE_COUNTS = {
  'apps/control-desktop/electron/ipc.ts': 100,
  'apps/control-desktop/electron/preload.ts': 50,
  'apps/control-desktop/src/App.tsx': 40,
  'apps/control-desktop/src/components/layout/Shell.tsx': 40,
  'apps/control-desktop/src/stores/appStore.ts': 40,
  'apps/control-desktop/electron/config.ts': 30,
  'apps/control-desktop/src/hooks/useLocalBootstrap.ts': 15,
  'package.json': 8,
  'README.md': 15,
};

const failures = [];

for (const rel of CORE_FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`missing core file: ${rel}`);
    continue;
  }
  const content = read(abs);
  const lines = content.split('\n');

  if (lines.length <= 1 && content.length > 80) {
    failures.push(`${rel} must not be a single-line file`);
  }

  const minLines = MIN_LINE_COUNTS[rel];
  if (minLines && lines.length < minLines && content.length > 80) {
    failures.push(`${rel} must have at least ${minLines} lines (got ${lines.length})`);
  }

  if (content.includes('\r\n') || (content.includes('\r') && !content.includes('\n'))) {
    failures.push(`${rel} must use LF line endings`);
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 2000) {
      failures.push(`${rel} line ${i + 1} exceeds 2000 characters`);
    }
  }
}

const programCs = read(
  path.join(ROOT, 'apps/control-desktop/native-helper/Zhubo.NativeHelper/Program.cs'),
);
const hasMoveWindowEntry =
  programCs.includes('EntryPoint = "MoveWindow"') ||
  /DllImport\("user32\.dll"[^)]*\)\s*\n\s*private static extern bool MoveWindow\(/.test(
    programCs,
  );
if (!hasMoveWindowEntry) {
  failures.push('Program.cs must DllImport user32 MoveWindow via EntryPoint or method name');
}

const gitMgr = read(path.join(ROOT, 'apps/control-desktop/electron/git-manager.ts'));
if (!gitMgr.includes('finalizeGitCommitPaths')) {
  failures.push('git-manager must define finalizeGitCommitPaths');
}

const gitAttrs = read(path.join(ROOT, '.gitattributes'));
for (const needle of [
  '*.ts text eol=lf',
  '*.tsx text eol=lf',
  '*.js text eol=lf',
  '*.mjs text eol=lf',
  '*.json text eol=lf',
  '*.cs text eol=lf',
  '.gitignore text eol=lf',
]) {
  if (!gitAttrs.includes(needle)) failures.push(`.gitattributes missing ${needle}`);
}

if (failures.length) {
  console.error('FAIL source format acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, files: CORE_FILES.length, checks: 8 }, null, 2));
