#!/usr/bin/env node
/** 验收：Agent 扫描 + manifest 导入 + 项目列表 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function loadEnvFile() {
  const fp = path.join(ROOT, '.env');
  if (!fs.existsSync(fp)) return;
  for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvFile();

const SERVER = (process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control').replace(/\/$/, '');
const USER = process.env.ADMIN_USERNAME || 'admin';
const PASS = process.env.ADMIN_PASSWORD || '';

function loadManifests() {
  try {
    const { scanManifestsUnderRoot } = require('../packages/control-shared/dist/manifestFsScan.js');
    const base = process.env.SCAN_ROOT || 'E:\\我的软件源码';
    const { manifests, warnings } = scanManifestsUnderRoot(base);
    return { manifests, warnings };
  } catch {
    return { manifests: [], warnings: ['请先 npm run build -w @zhubo/control-shared'] };
  }
}

async function login() {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie
    .split(',')
    .map((s) => s.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `登录失败 ${res.status}`);
  }
  return cookie;
}

async function api(cookie, pathname, opts = {}) {
  const res = await fetch(`${SERVER}${pathname}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const report = { server: SERVER, steps: [] };
  try {
    const cookie = await login();
    report.steps.push({ step: 'login', ok: true });

    const health = await api(cookie, '/api/health');
    report.steps.push({ step: 'control_health', ok: health.status === 200, ...health });

    const before = await api(cookie, '/api/projects');
    const beforeCodes = new Set((before.data || []).map((p) => p.code));
    report.steps.push({ step: 'projects_before', count: (before.data || []).length });

    const { manifests, warnings } = loadManifests();
    report.steps.push({ step: 'manifest_scan', count: manifests.length, warnings });

    const imp = await api(cookie, '/api/projects/import-manifests', {
      method: 'POST',
      body: JSON.stringify({ manifests }),
    });
    report.steps.push({
      step: 'import_manifests',
      ok: imp.status === 200,
      status: imp.status,
      ...imp.data,
    });

    const after = await api(cookie, '/api/projects');
    report.steps.push({
      step: 'projects_after',
      count: (after.data || []).length,
      codes: (after.data || []).map((p) => p.code),
      newCodes: (after.data || []).map((p) => p.code).filter((c) => !beforeCodes.has(c)),
    });

    const ops = await api(cookie, '/api/dashboard/operations?limit=20');
    const list = Array.isArray(ops.data) ? ops.data : [];
    report.steps.push({
      step: 'operation_log',
      manifest_import: list.filter((o) => o.action === 'manifest_import').slice(0, 3),
      scan_upload: list.filter((o) => o.action === 'scan_upload').slice(0, 3),
      scan_upload_failed: list.filter((o) => o.action === 'scan_upload_failed').slice(0, 3),
    });

    const rescan = await api(cookie, '/api/ports/rescan', { method: 'POST', body: '{}' });
    report.steps.push({ step: 'rescan_request', ok: rescan.status === 200, ...rescan.data });
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
