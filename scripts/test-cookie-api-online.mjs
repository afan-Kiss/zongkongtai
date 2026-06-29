/**
 * 线上 Cookie API 验收（不打印完整 Cookie / Token）
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control').replace(/\/$/, '');

function loadToken() {
  if (process.env.CONTROL_SERVICE_TOKEN) return process.env.CONTROL_SERVICE_TOKEN;
  if (process.env.SERVICE_TOKEN) return process.env.SERVICE_TOKEN;
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return '';
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const s = line.trim();
    if (s.startsWith('SERVICE_TOKEN=')) return s.slice('SERVICE_TOKEN='.length).trim();
  }
  return '';
}

const TOKEN = loadToken();
const SHOP = '测试店铺';
const TEST_COOKIE = `a=1; b=2; xhsTrackerId=test-${Date.now()}`;

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('[online-cookie-test] base=', BASE);

  const health = await req('/api/health');
  if (!health.data?.ok) throw new Error(`health failed: ${health.status}`);
  console.log('[online-cookie-test] health OK');

  if (!TOKEN) throw new Error('missing SERVICE_TOKEN');

  const bad = await req('/api/secrets/qianfan/upload-cookie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid' },
    body: JSON.stringify({ platform: 'qianfan', shopName: SHOP, cookie: 'x=1' }),
  });
  if (bad.status !== 403) throw new Error(`bad token expected 403 got ${bad.status}`);
  console.log('[online-cookie-test] bad token rejected OK');

  const upload = await req('/api/secrets/qianfan/upload-cookie', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'x-service-token': TOKEN,
    },
    body: JSON.stringify({
      platform: 'qianfan',
      shopName: SHOP,
      shopId: 'test-shop',
      accountName: 'test',
      cookie: TEST_COOKIE,
      source: 'qianfan-relay-cdp',
      collectorMachine: '培育钻石',
      collectorProject: '千帆中转机器人',
      lastSeenUrl: 'https://ark.xiaohongshu.com/',
      capturedAt: new Date().toISOString(),
    }),
  });
  if (!upload.data?.ok) throw new Error(`upload failed: ${JSON.stringify(upload.data)}`);
  console.log('[online-cookie-test] upload OK hash=', upload.data.cookieHash);

  const resolveOk = await req(
    `/api/secrets/resolve?platform=qianfan&shopName=${encodeURIComponent(SHOP)}&keyName=cookie`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'x-project-name': 'online-cookie-test',
      },
    }
  );
  if (!resolveOk.data?.ok || resolveOk.data.value !== TEST_COOKIE) {
    throw new Error('resolve value mismatch');
  }
  console.log('[online-cookie-test] resolve OK len=', resolveOk.data.value?.length);

  const resolveBad = await req(
    `/api/secrets/resolve?platform=qianfan&shopName=${encodeURIComponent(SHOP)}&keyName=cookie`
  );
  if (resolveBad.status !== 403) throw new Error(`resolve without token expected 403 got ${resolveBad.status}`);
  console.log('[online-cookie-test] resolve without token rejected OK');

  const upload2 = await req('/api/secrets/qianfan/upload-cookie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      platform: 'qianfan',
      shopName: SHOP,
      cookie: TEST_COOKIE,
      collectorProject: 'online-cookie-test',
      capturedAt: new Date().toISOString(),
    }),
  });
  if (!upload2.data?.unchanged) throw new Error('expected unchanged refresh');
  console.log('[online-cookie-test] unchanged refresh OK');

  console.log('[online-cookie-test] passed');
}

main().catch((e) => {
  console.error('[online-cookie-test] failed', e.message || e);
  process.exit(1);
});
