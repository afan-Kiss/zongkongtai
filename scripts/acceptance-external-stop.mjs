#!/usr/bin/env node
/** 外部进程安全结束 — 静态验收 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps/control-desktop/src');
const ELECTRON = path.join(ROOT, 'apps/control-desktop/electron');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const failures = [];
const card = read(path.join(SRC, 'components/ProjectCard.tsx'));
const ipc = read(path.join(ELECTRON, 'ipc.ts'));
const preload = read(path.join(ELECTRON, 'preload.ts'));
const stopMod = read(path.join(ELECTRON, 'external-process-stop.ts'));

if (!card.includes('结束外部进程')) {
  failures.push('ProjectCard must show 结束外部进程 button');
}
if (!card.includes('canStopExternal')) {
  failures.push('ProjectCard must respect canStopExternal');
}
if (!card.includes('这是外部启动的进程，结束前请确认不是其他重要软件')) {
  failures.push('ProjectCard must confirm before stopping external process');
}
if (!ipc.includes('process:stopExternal')) {
  failures.push('ipc must expose process:stopExternal');
}
if (!preload.includes('stopExternal')) {
  failures.push('preload must expose stopExternal');
}
if (!stopMod.includes('stopExternalProcess')) {
  failures.push('external-process-stop must implement stopExternalProcess');
}
if (!stopMod.includes('nginx')) {
  failures.push('protection list must include nginx');
}
if (!stopMod.includes('zhubo-analysis')) {
  failures.push('protection list must include zhubo-analysis');
}
if (!stopMod.includes('zhubo-control')) {
  failures.push('protection list must include zhubo-control');
}
if (!stopMod.includes('taskkill')) {
  failures.push('must use taskkill on Windows');
}

if (failures.length) {
  console.error('FAIL external-stop acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 7 }, null, 2));
