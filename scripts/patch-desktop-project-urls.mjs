#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLOUD = process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control';

const PATCHES = [
  {
    match: (p) => p.name === '祥钰系统' || p.code === 'xiangyu-system' || p.code === '祥钰系统',
    localWebUrl: 'http://127.0.0.1:4726',
    localHealthUrl: 'http://127.0.0.1:4726/api/health',
    notesAppend: '桌面 EXE：Web/health 4726；9323 为历史 bridge',
  },
  {
    match: (p) => p.name?.includes('扫码枪'),
    localWebUrl: 'http://127.0.0.1:5173',
    localHealthUrl: 'http://127.0.0.1:4725/api/health',
    notesAppend: '桌面 dev：Web 5173，API health 4725',
  },
];

async function main() {
  const t = fs.readFileSync(path.join(ROOT, 'deploy-output-credentials.txt'), 'utf8');
  const creds = {
    username: t.match(/^ADMIN_USERNAME=(.+)$/m)?.[1]?.trim() || 'admin',
    password: t.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim(),
  };
  const login = await fetch(`${CLOUD}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const projects = await (await fetch(`${CLOUD}/api/projects`, { headers })).json();
  const results = [];

  for (const patch of PATCHES) {
    const project = projects.find(patch.match);
    if (!project) {
      results.push({ patch: patch.notesAppend, skipped: true });
      continue;
    }
    const res = await fetch(`${CLOUD}/api/projects/${project.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        localWebUrl: patch.localWebUrl,
        localHealthUrl: patch.localHealthUrl,
        notes: [project.notes, patch.notesAppend].filter(Boolean).join(' | '),
      }),
    });
    results.push({ name: project.name, ok: res.ok, status: res.status });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
