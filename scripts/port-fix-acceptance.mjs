/**
 * 端口优化验收
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const credFile = path.join(root, 'deploy-output-credentials.txt');

function readCred(key) {
  const m = fs.readFileSync(credFile, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m?.[1]?.trim() || '';
}

const BASE = 'http://8.137.126.18/control';
let cookie = '';

async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  const raw = res.headers.get('set-cookie');
  if (raw) cookie = raw.split(',').map((s) => s.split(';')[0].trim()).join('; ');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${pathname}`);
  return data;
}

async function main() {
  await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: readCred('ADMIN_PASSWORD') }),
  });

  await api('/api/ports/rescan', { method: 'POST' });
  console.log('rescan triggered, waiting 15s...');
  await new Promise((r) => setTimeout(r, 15000));

  const dash = await api('/api/dashboard/stats');
  const projects = await api('/api/projects');
  const archivedResp = await api('/api/projects?includeArchived=1');
  const archivedList = Array.isArray(archivedResp) ? archivedResp : [];
  const ports = await api('/api/ports');
  const conflicts = await api('/api/ports/conflicts');
  const ops = await api('/api/dashboard/operations');

  const conflictPorts = conflicts.filter((p) => p.conflictLevel === 'conflict');
  const warningPorts = conflicts.filter((p) => p.conflictLevel === 'warning');
  const unknownPorts = ports.filter((p) => p.sourceType === 'runtime' && !p.projectId && p.runtimeStatus === 'active');
  const scanOps = ops.filter((o) => o.action === 'scan_upload');

  const report = {
    dashboard: dash,
    activeProjects: projects.length,
    archivedProjects: archivedList.filter((p) => p.archived).map((p) => `${p.name} (${p.code})`),
    portCount: ports.length,
    conflictPorts: conflictPorts.map((p) => ({
      port: p.port,
      project: p.project?.name,
      role: p.role,
      reason: p.conflictReason,
    })),
    warningPorts: warningPorts.slice(0, 25).map((p) => ({
      port: p.port,
      project: p.project?.name || '未登记',
      role: p.role,
      reason: p.conflictReason,
    })),
    unknownPorts: unknownPorts.map((p) => ({ port: p.port, process: p.processName, pid: p.pid })),
    latestScanOp: scanOps[0] || null,
    zhuboAnalysisHealth: await fetch('http://8.137.126.18/api/health').then((r) => r.json()).catch((e) => ({ error: String(e) })),
  };

  fs.writeFileSync(path.join(root, 'scripts/port-fix-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
