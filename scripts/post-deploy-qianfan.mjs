#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLOUD = process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control';
const credsText = fs.readFileSync(path.join(ROOT, 'deploy-output-credentials.txt'), 'utf8');
const creds = {
  username: credsText.match(/^ADMIN_USERNAME=(.+)$/m)?.[1]?.trim() || 'admin',
  password: credsText.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim(),
};

async function login() {
  const res = await fetch(`${CLOUD}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] || '';
  return cookie;
}

async function main() {
  const cookie = await login();
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };

  const align = await fetch(`${CLOUD}/api/secrets/maintenance/align-qianfan`, {
    method: 'POST',
    headers,
  });
  console.log('align', align.status, await align.text());

  const shops = await (await fetch(`${CLOUD}/api/secrets/qianfan/shops`, { headers })).json();
  console.log('shops', JSON.stringify(shops, null, 2));

  const patchMod = await import('./patch-desktop-project-urls.mjs');
  await patchMod.default?.() || (await import('./patch-desktop-project-urls.mjs'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
