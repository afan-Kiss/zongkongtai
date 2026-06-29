/**
 * 总控台千帆 Cookie API 验收脚本（不上传真实 Cookie）
 */
const BASE = (process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control').replace(/\/$/, '');
const TOKEN = process.env.CONTROL_SERVICE_TOKEN || '';
const BAD = 'invalid-token-for-test';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('[cookie-api-test] base=', BASE);

  const badUpload = await req('/api/secrets/qianfan/upload-cookie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BAD}` },
    body: JSON.stringify({ platform: 'qianfan', shopName: '测试店', cookie: 'a=1' }),
  });
  if (badUpload.status !== 403) {
    throw new Error(`bad token upload expected 403, got ${badUpload.status}`);
  }
  console.log('[cookie-api-test] bad token rejected OK');

  if (!TOKEN) {
    console.log('[cookie-api-test] skip live upload/resolve (no CONTROL_SERVICE_TOKEN)');
    return;
  }

  const testCookie = `test_session=${Date.now()}; path=/`;
  const upload = await req('/api/secrets/qianfan/upload-cookie', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'x-service-token': TOKEN,
    },
    body: JSON.stringify({
      platform: 'qianfan',
      shopName: '__api_test_shop__',
      cookie: testCookie,
      source: 'qianfan-relay-cdp',
      collectorMachine: 'test-runner',
      collectorProject: 'cookie-api-test',
      capturedAt: new Date().toISOString(),
    }),
  });
  if (!upload.data?.ok) throw new Error(`upload failed: ${JSON.stringify(upload.data)}`);
  console.log('[cookie-api-test] upload OK hash=', upload.data.cookieHash);

  const resolve = await req(
    `/api/secrets/resolve?platform=qianfan&shopName=${encodeURIComponent('__api_test_shop__')}&keyName=cookie`,
    { headers: { Authorization: `Bearer ${TOKEN}`, 'x-project-name': 'cookie-api-test' } }
  );
  if (!resolve.data?.ok || resolve.data.value !== testCookie) {
    throw new Error(`resolve mismatch: ${JSON.stringify(resolve.data)}`);
  }
  console.log('[cookie-api-test] resolve OK');

  const upload2 = await req('/api/secrets/qianfan/upload-cookie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      platform: 'qianfan',
      shopName: '__api_test_shop__',
      cookie: testCookie,
      collectorProject: 'cookie-api-test',
      capturedAt: new Date().toISOString(),
    }),
  });
  if (!upload2.data?.unchanged) {
    throw new Error('expected unchanged on second upload');
  }
  console.log('[cookie-api-test] unchanged refresh OK');
  console.log('[cookie-api-test] passed');
}

main().catch((err) => {
  console.error('[cookie-api-test] failed', err.message || err);
  process.exit(1);
});
