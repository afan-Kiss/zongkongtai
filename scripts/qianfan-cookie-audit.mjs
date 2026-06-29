#!/usr/bin/env node
/** 审计线上 qianfan Cookie 记录 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLOUD = process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control';

const CANONICAL = ['拾玉居和田玉', '和田雅玉', '祥钰珠宝', 'XY祥钰珠宝'];
const TEST_EXACT = new Set(['店铺A', '店铺B', '店铺C', '店铺D', '测试店铺', '未识别店铺']);

function resolveCanonical(raw) {
  const n = String(raw || '').trim();
  if (CANONICAL.includes(n)) return n;
  for (const c of CANONICAL) if (n.includes(c)) return c;
  if (/XY\s*祥钰/i.test(n)) return 'XY祥钰珠宝';
  if (/拾玉居/i.test(n)) return '拾玉居和田玉';
  if (/和田雅玉/i.test(n)) return '和田雅玉';
  if (/祥钰珠宝/i.test(n)) return '祥钰珠宝';
  return null;
}

function isTest(raw) {
  const n = String(raw || '').trim();
  return TEST_EXACT.has(n) || /测试|^店铺[A-Da-d]$/.test(n);
}

async function main() {
  const f = path.join(ROOT, 'deploy-output-credentials.txt');
  const t = fs.readFileSync(f, 'utf8');
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
  const res = await fetch(`${CLOUD}/api/secrets?platform=qianfan&includeArchived=1`, {
    headers: { Cookie: cookie },
  });
  const rows = await res.json();

  const records = rows
    .filter((r) => r.keyName === 'cookie')
    .map((r) => ({
      shopName: r.shopName,
      rawShopName: r.rawShopName || r.shopName,
      canonicalShopName: resolveCanonical(r.rawShopName || r.shopName),
      shopId: r.shopId,
      accountName: r.accountName,
      hash8: String(r.cookieHash || '').slice(0, 8),
      updatedAt: r.updatedAt,
      source: r.collectorSource,
      machine: r.collectorMachine,
      by: r.lastUploadedBy,
      archived: r.archived,
      isFormal: resolveCanonical(r.rawShopName || r.shopName) && !r.archived && !isTest(r.shopName),
      isTest: isTest(r.shopName) || r.archived,
      id: r.id,
    }));

  const out = {
    at: new Date().toISOString(),
    cloud: CLOUD,
    records,
    formalFound: CANONICAL.map((name) => ({
      name,
      ok: records.some((r) => r.canonicalShopName === name && r.isFormal),
    })),
  };

  fs.writeFileSync(path.join(ROOT, 'scripts/qianfan-cookie-audit.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
