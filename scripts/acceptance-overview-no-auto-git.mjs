#!/usr/bin/env node
/** 总览不自动刷新 Git — 静态验收 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps/control-desktop/src');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const failures = [];
const overview = read(path.join(SRC, 'pages/OverviewPage.tsx'));
const store = read(path.join(SRC, 'stores/appStore.ts'));

if (overview.includes('git.list')) {
  failures.push('OverviewPage must not call git.list directly on mount');
}
if (overview.includes('useEffect') && /git\.list/.test(overview)) {
  failures.push('OverviewPage useEffect must not trigger git.list');
}
if (!overview.includes('gitSummary')) {
  failures.push('OverviewPage must read gitSummary from store');
}
if (!overview.includes('未检查')) {
  failures.push('OverviewPage must show 未检查 when no cache');
}
if (!overview.includes('检查 Git')) {
  failures.push('OverviewPage must have 检查 Git button');
}
if (!overview.includes('refreshGitSummary')) {
  failures.push('OverviewPage refresh must call refreshGitSummary');
}
if (!store.includes('refreshGitSummary')) {
  failures.push('appStore must have refreshGitSummary');
}
if (!store.includes('setGitSummary')) {
  failures.push('appStore must have setGitSummary');
}

const rightPanel = read(path.join(SRC, 'components/ProjectCard.tsx'));
if (!rightPanel.includes('gitSummary')) {
  failures.push('RightPanel must read gitSummary cache');
}

if (failures.length) {
  console.error('FAIL overview-no-auto-git acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 5 }, null, 2));
