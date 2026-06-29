#!/usr/bin/env node
/** Call align-qianfan maintenance endpoint */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLOUD = 'http://8.137.126.18/control';
const t = fs.readFileSync(path.join(ROOT, 'deploy-output-credentials.txt'), 'utf8');
const login = await fetch(`${CLOUD}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: t.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim(),
  }),
});
const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
const res = await fetch(`${CLOUD}/api/secrets/maintenance/align-qianfan`, { method: 'POST', headers });
console.log(await res.json());
