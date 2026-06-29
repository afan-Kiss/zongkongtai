#!/usr/bin/env node
/** 验收：Agent 扫描 + manifest 导入 + 项目列表 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

async function login() {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] || '';
  if (!res.ok) throw new Error(`登录失败 ${res.status}`);
  return cookie;
}

function loadManifests() {
  const base = process.env.SCAN_ROOT || 'E:\\我的软件源码';
  const out = [];
  for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const mf = path.join(base, ent.name, 'zhubo-control.manifest.json');
    if (fs.existsSync(mf)) out.push(JSON.parse(fs.readFileSync(mf, 'utf8')));
  }
  return out;
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

    const manifests = loadManifests();
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
    const afterCodes = new Set((after.data || []).map((p) => p.code));
    report.steps.push({
      step: 'projects_after',
      count: (after.data || []).length,
      codes: [...afterCodes],
      newCodes: [...afterCodes].filter((c) => !beforeCodes.has(c)),
    });

    const ops = await api(cookie, '/api/dashboard/operations?limit=5');
    const manifestOps = (ops.data || []).filter((o) => o.action === 'manifest_import');
    report.steps.push({
      step: 'operation_log',
      ok: manifestOps.length > 0,
      latest: manifestOps[0] || null,
    });

    const rescan = await api(cookie, '/api/ports/rescan', { method: 'POST', body: '{}' });
    report.steps.push({ step: 'rescan_request', ok: rescan.status === 200, ...rescan.data });
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
