#!/usr/bin/env node
/** manifest 启动命令 — 静态验收 */
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

const failures = [];
const startCmd = read(path.join(ELECTRON, 'start-command.ts'));
const desktop = read(path.join(ELECTRON, 'desktop-commands.ts'));
const processMgr = read(path.join(ELECTRON, 'process-manager.ts'));
const external = read(path.join(ELECTRON, 'external-project-status.ts'));
const card = read(path.join(SRC, 'components/ProjectCard.tsx'));

if (!startCmd.includes('resolveManifestStartCommand')) {
  failures.push('start-command must resolve manifest commands only');
}
if (!startCmd.includes('isStaleProjectPath')) {
  failures.push('must block archive/backup/old paths');
}
if (!startCmd.includes('wxbot-new-oneclick')) {
  failures.push('qianfan must support wxbot-new-oneclick.js entry');
}
const desktopStartMatch = desktop.match(
  /export function resolveDesktopStartCommand[\s\S]*?^}/m,
);
if (desktopStartMatch && desktopStartMatch[0].includes('lookupEntry')) {
  failures.push('resolveDesktopStartCommand must not fallback to lookupEntry defaults');
}
if (!processMgr.includes('validateProjectStartCommand')) {
  failures.push('process-manager preflight must validate manifest start command');
}
if (!processMgr.includes('9323/api/health')) {
  failures.push('qianfan startup must check 9323 /api/health');
}
if (!card.includes('本地目录不存在')) {
  failures.push('ProjectCard must disable start when localPath missing');
}

if (/千\s+帆|q\s+i\s+a\s+n\s+f\s+a\s+n|q\s+i\s+q\s+i\s+r\s+e\s+n|中\s+转/.test(external)) {
  failures.push('external-project-status must not contain broken spaced regex');
}
const externalLines = external.split('\n').length;
if (externalLines < 80) {
  failures.push('external-project-status must be multi-line formatted');
}

if (failures.length) {
  console.error('FAIL start-command acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 7 }, null, 2));
