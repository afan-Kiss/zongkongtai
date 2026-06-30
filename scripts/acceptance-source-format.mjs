#!/usr/bin/env node
/** 核心源码格式验收 — 多行、LF、行宽、关键安全逻辑 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const CORE_FILES = [
  'apps/control-desktop/electron/git-manager.ts',
  'apps/control-desktop/electron/cloud-client.ts',
  'apps/control-desktop/electron/ipc.ts',
  'apps/control-desktop/electron/preload.ts',
  'packages/control-shared/src/gitSecurity.ts',
  'apps/control-desktop/src/pages/GitPage.tsx',
  'apps/control-desktop/src/pages/SettingsPage.tsx',
  'apps/control-desktop/src/pages/HealthPage.tsx',
  'apps/control-desktop/src/components/layout/Shell.tsx',
  'apps/control-desktop/native-helper/Zhubo.NativeHelper/Program.cs',
  '.gitignore',
  'package.json',
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

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
if (programCs.includes('MoveWindowNative')) {
  failures.push('Program.cs must not reference MoveWindowNative');
}

const gitMgr = read(path.join(ROOT, 'apps/control-desktop/electron/git-manager.ts'));
if (!gitMgr.includes('finalizeGitCommitPaths')) {
  failures.push('git-manager must define finalizeGitCommitPaths for main-process re-filter');
}
if (!/finalizeGitCommitPaths\([\s\S]*filterGitPaths/.test(gitMgr)) {
  failures.push('git-manager finalizeGitCommitPaths must call filterGitPaths');
}
if (!/gitCommitAndPush[\s\S]*finalizeGitCommitPaths/.test(gitMgr)) {
  failures.push('gitCommitAndPush must call finalizeGitCommitPaths before git add');
}

const gitAttrs = read(path.join(ROOT, '.gitattributes'));
for (const needle of ['*.ts text eol=lf', '*.tsx text eol=lf', '*.cs text eol=lf']) {
  if (!gitAttrs.includes(needle)) failures.push(`.gitattributes missing ${needle}`);
}

if (failures.length) {
  console.error('FAIL source format acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, files: CORE_FILES.length, checks: 6 }, null, 2));
