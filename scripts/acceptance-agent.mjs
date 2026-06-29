/**
 * Agent 接入验收脚本
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const credFile = path.join(root, 'deploy-output-credentials.txt');

function readCred(key) {
  const text = fs.readFileSync(credFile, 'utf8');
  const m = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m?.[1]?.trim() || '';
}

const BASE = 'http://8.137.126.18/control';
let cookie = '';

async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(opts.headers || {}),
    },
  });
  const raw = res.headers.get('set-cookie');
  if (raw) {
    cookie = raw.split(',').map((s) => s.split(';')[0].trim()).join('; ');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${pathname}`);
  return data;
}

async function main() {
  await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: readCred('ADMIN_PASSWORD') }),
  });

  const dash = await api('/api/dashboard/stats');
  const agents = await api('/api/agents');
  const projects = await api('/api/projects');
  const ports = await api('/api/ports');
  const conflicts = await api('/api/ports/conflicts');
  const secrets = await api('/api/secrets');
  const ops = await api('/api/dashboard/operations');

  const runtimePorts = ports.filter((p) => p.isRuntimeDetected);
  const unknownPorts = ports.filter((p) => p.sourceType === 'runtime' && !p.projectId);
  const conflictPorts = conflicts.filter((c) => c.conflictLevel === 'conflict');

  const report = {
    machineName: os.hostname(),
    scanRoot: 'E:\\我的软件源码',
    agentOnline: agents.some((a) => a.online),
    agents,
    dashboard: dash,
    projectCount: projects.length,
    portCount: ports.length,
    conflictCount: conflictPorts.length,
    runtimePortCount: runtimePorts.length,
    unknownPortCount: unknownPorts.length,
    projects: projects.map((p) => ({
      name: p.name,
      code: p.code,
      category: p.category,
      localPath: p.localPath,
      startCommand: p.startCommand,
      devCommand: p.devCommand,
      buildCommand: p.buildCommand,
      healthUrl: p.healthUrl,
      ports: (p.ports || []).map((x) => x.port),
      lastScannedAt: p.lastScannedAt,
      notes: p.notes,
    })),
    conflictPorts: conflictPorts.map((p) => ({
      port: p.port,
      project: p.project?.name || '未登记',
      conflictLevel: p.conflictLevel,
    })),
    runtimePorts: runtimePorts.slice(0, 30).map((p) => ({
      port: p.port,
      project: p.project?.name || '未知',
      purpose: p.purpose,
      isRuntimeDetected: p.isRuntimeDetected,
    })),
    unknownPorts: unknownPorts.map((p) => ({ port: p.port, purpose: p.purpose })),
    secretsCheck: {
      count: secrets.length,
      allMasked: secrets.every((s) => !s.encryptedValue && (secrets.length === 0 || String(s.valuePreview || '').includes('*') || s.valuePreview?.length < 20)),
      noPlaintextField: secrets.every((s) => s.encryptedValue === undefined || s.encryptedValue === null),
    },
    recentOps: ops.slice(0, 8),
  };

  fs.writeFileSync(path.join(root, 'scripts/acceptance-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
