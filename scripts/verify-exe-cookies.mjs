#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLOUD = 'http://8.137.126.18/control';
const t = fs.readFileSync(path.join(ROOT, 'deploy-output-credentials.txt'), 'utf8');
const login = await fetch(`${CLOUD}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: t.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim() }),
});
const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
const headers = { Cookie: cookie };
const shops = await (await fetch(`${CLOUD}/api/secrets/qianfan/shops`, { headers })).json();
console.log(JSON.stringify(shops, null, 2));
const projects = await (await fetch(`${CLOUD}/api/projects`, { headers })).json();
console.log('projects', projects.map((p) => ({ name: p.name, code: p.code, localWebUrl: p.localWebUrl, localHealthUrl: p.localHealthUrl, healthUrl: p.healthUrl })));
