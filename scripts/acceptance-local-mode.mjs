#!/usr/bin/env node
/** 本地模式 — 静态验收（兼容 local-only） */
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

const shell = read(path.join(SRC, 'components/layout/Shell.tsx'));
if (shell.includes('用户名或密码错误') || shell.includes('云端未连接')) {
  failures.push('TopBar must not show cloud auth errors');
}
if (!shell.includes('本地模式')) failures.push('TopBar must show 本地模式');

const bootstrap = read(path.join(SRC, 'hooks/useLocalBootstrap.ts'));
if (!bootstrap.includes('projects.loadLocal')) {
  failures.push('useLocalBootstrap must load local projects first');
}

const ipc = read(path.join(ELECTRON, 'ipc.ts'));
if (!ipc.includes('projects:loadLocal')) failures.push('ipc must expose projects:loadLocal');
if (!ipc.includes('local-cookie-store')) failures.push('ipc must use local cookie store');

if (failures.length) {
  console.error('FAIL local mode acceptance:');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: failures.length === 0 ? 6 : 0 }, null, 2));
