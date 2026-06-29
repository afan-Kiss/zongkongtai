#!/usr/bin/env node
/** Quick upload test via public URL */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const creds = fs.readFileSync(path.join(ROOT, 'deploy-output-credentials.txt'), 'utf8');
const token = creds.match(/^SERVICE_TOKEN=(.+)$/m)?.[1]?.trim();
const url = 'http://8.137.126.18/control/api/secrets/qianfan/upload-cookie';

const body = {
  platform: 'qianfan',
  shopName: '测试连通-和田雅玉',
  cookie: 'test_cookie_name=test_value; session=abc12345678901234567890',
  source: 'connectivity-test',
  collectorMachine: 'local-script',
};

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-service-token': token,
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(JSON.stringify({ status: res.status, body: text.slice(0, 300) }, null, 2));
