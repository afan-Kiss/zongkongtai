/** 只检查 manifest 运行相关 URL 字段，不扫 gitRemote / README */

const RUNTIME_URL_KEYS = new Set([
  'publicUrl',
  'internalUrl',
  'localWebUrl',
  'localHealthUrl',
  'healthUrl',
  'wsUrl',
]);

const SERVICE_URL_KEYS = new Set(['webUrl', 'healthUrl', 'wsUrl']);

const FORBIDDEN_PATTERNS = [
  /xiangyuzhubao\.xyz/i,
  /^wss:\/\/xiangyuzhubao\.xyz/i,
  /^https:\/\/xiangyuzhubao\.xyz/i,
];

const ALLOWED_PUBLIC = [/^http:\/\/8\.137\.126\.18(\/|$)/i];
const ALLOWED_LOCAL = [/^http:\/\/127\.0\.0\.1/i, /^http:\/\/localhost/i];

/** GitHub remote https://github.com 不在运行 URL 检查范围内 */
const ALLOW_GITHUB = /^https:\/\/github\.com\//i;

function isAllowedRuntimeUrl(key: string, value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (ALLOW_GITHUB.test(v)) return true;
  if (FORBIDDEN_PATTERNS.some((p) => p.test(v))) return false;
  if (/^wss:\/\//i.test(v) && !/^wss:\/\/127\.0\.0\.1/i.test(v)) return false;
  if (/^https:\/\//i.test(v) && !/^https:\/\/github\.com\//i.test(v)) return false;

  if (key === 'publicUrl' || key === 'internalUrl') {
    return ALLOWED_PUBLIC.some((p) => p.test(v));
  }
  if (key === 'localWebUrl' || key === 'localHealthUrl' || key === 'healthUrl') {
    return ALLOWED_LOCAL.some((p) => p.test(v)) || ALLOWED_PUBLIC.some((p) => p.test(v));
  }
  if (key === 'wsUrl') {
    return /^ws:\/\/127\.0\.0\.1/i.test(v) || /^ws:\/\/8\.137\.126\.18/i.test(v);
  }
  return true;
}

function collectRuntimeUrls(obj: unknown, path = ''): Array<{ path: string; value: string }> {
  const hits: Array<{ path: string; value: string }> = [];
  if (!obj || typeof obj !== 'object') return hits;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => hits.push(...collectRuntimeUrls(item, `${path}[${i}]`)));
    return hits;
  }

  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    const full = path ? `${path}.${k}` : k;
    if (k === 'control' && v && typeof v === 'object') {
      const c = v as Record<string, unknown>;
      if (typeof c.serverUrl === 'string') {
        hits.push({ path: `${full}.serverUrl`, value: c.serverUrl });
      }
    }
    if (typeof v === 'string' && (RUNTIME_URL_KEYS.has(k) || SERVICE_URL_KEYS.has(k))) {
      hits.push({ path: full, value: v });
    } else if (k === 'services' && Array.isArray(v)) {
      v.forEach((svc, i) => {
        if (!svc || typeof svc !== 'object') return;
        for (const [sk, sv] of Object.entries(svc as Record<string, unknown>)) {
          if (typeof sv === 'string' && SERVICE_URL_KEYS.has(sk)) {
            hits.push({ path: `${full}[${i}].${sk}`, value: sv });
          }
        }
      });
    } else if (v && typeof v === 'object' && k !== 'control') {
      hits.push(...collectRuntimeUrls(v, full));
    }
  }
  return hits;
}

export function findForbiddenRuntimeUrls(manifest: unknown): string[] {
  const bad: string[] = [];
  for (const { path: p, value } of collectRuntimeUrls(manifest)) {
    const key = p.split('.').pop() || p;
    if (!isAllowedRuntimeUrl(key, value)) bad.push(`${p}=${value}`);
  }
  return bad;
}

export function scanManifestFileForbidden(content: string): string[] {
  try {
    return findForbiddenRuntimeUrls(JSON.parse(content));
  } catch {
    return [];
  }
}
