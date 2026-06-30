#!/usr/bin/env node
/** 全量验收扫描：读取所有 zhubo-control.manifest.json 并检测 health */
import fs from 'fs';
import path from 'path';

const ROOT = process.env.SCAN_ROOT || 'E:\\我的软件源码';
const MANIFEST = 'zhubo-control.manifest.json';
const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'dist-desktop',
  'win-unpacked',
]);

async function checkHealth(url, timeoutMs = 4000) {
  if (!url) return { ok: false, skip: true, message: '无 health 地址' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function gitRemote(dir) {
  try {
    const gitDir = path.join(dir, '.git', 'config');
    if (!fs.existsSync(gitDir)) return '';
    const cfg = fs.readFileSync(gitDir, 'utf8');
    const m = cfg.match(/url\s*=\s*(.+)/);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

function scanManifests(basePath) {
  const out = [];
  const walk = (dir, depth) => {
    const mf = path.join(dir, MANIFEST);
    if (fs.existsSync(mf)) {
      try {
        out.push({ dir, manifest: JSON.parse(fs.readFileSync(mf, 'utf8')) });
      } catch (e) {
        out.push({ dir, error: String(e) });
      }
      return;
    }
    if (depth > 2) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory() || SKIP.has(ent.name)) continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  };
  for (const ent of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!ent.isDirectory() || SKIP.has(ent.name)) continue;
    walk(path.join(basePath, ent.name), 0);
  }
  return out;
}

async function main() {
  const items = scanManifests(ROOT);
  const report = [];
  for (const { dir, manifest, error } of items) {
    if (error) {
      report.push({ dir, error });
      continue;
    }
    const healthUrl = manifest.localHealthUrl || manifest.healthUrl;
    const health =
      manifest.healthType === 'process'
        ? { ok: false, skip: true, message: '进程检测' }
        : await checkHealth(healthUrl);
    const forbidden = JSON.stringify(manifest).match(/xiangyuzhubao\.xyz|wss:\/\//i);
    report.push({
      name: manifest.name,
      code: manifest.code,
      category: manifest.category,
      localPath: manifest.localPath || dir,
      gitRemote: manifest.gitRemote || gitRemote(dir),
      desktopStartCommand: manifest.desktopStartCommand,
      desktopStopMode: manifest.desktopStopMode || 'process-tree',
      ports: manifest.ports || [],
      localWebUrl: manifest.localWebUrl || '',
      localHealthUrl: healthUrl || '',
      publicUrl: manifest.publicUrl || '',
      healthType: manifest.healthType || 'http',
      cookieMode: manifest.control?.cookieMode || 'none',
      health,
      forbiddenDomain: !!forbidden,
      pathExists: fs.existsSync(manifest.localPath || dir),
    });
  }
  console.log(
    JSON.stringify(
      { scannedAt: new Date().toISOString(), count: report.length, items: report },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
