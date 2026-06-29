import type { ZhuboControlManifest } from './manifest';

const CODE_RE = /^[a-zA-Z0-9_-]+$/;
const FORBIDDEN_URL = /xiangyuzhubao\.xyz|wss:\/\//i;
const FORBIDDEN_HTTPS = /^https:\/\//i;
const DANGEROUS_CMD = /\b(format\s+[a-z]:|del\s+\/|rd\s+\/|rm\s+-rf|shutdown|reg\s+delete)\b/i;

const ALLOWED_PUBLIC = /^$|^http:\/\/8\.137\.126\.18(\/[a-zA-Z0-9_/-]*)?\/?$/;
const ALLOWED_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/;

export interface ManifestValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

function checkUrl(field: string, url: string | undefined, localOnly: boolean): string[] {
  const issues: string[] = [];
  if (!url) return issues;
  if (FORBIDDEN_URL.test(url) || FORBIDDEN_HTTPS.test(url)) {
    issues.push(`${field} 不能使用域名、https 或 wss：${url}`);
  }
  if (localOnly && !ALLOWED_LOCAL.test(url)) {
    issues.push(`${field} 本地地址请使用 http://127.0.0.1 或 http://localhost：${url}`);
  }
  if (!localOnly && url && !ALLOWED_PUBLIC.test(url) && !ALLOWED_LOCAL.test(url)) {
    issues.push(`${field} 正式 publicUrl 请使用 http://8.137.126.18 或留空：${url}`);
  }
  return issues;
}

export function validateManifest(m: ZhuboControlManifest): ManifestValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!m.code?.trim()) errors.push('code 不能为空');
  else if (!CODE_RE.test(m.code)) errors.push(`code「${m.code}」只能含字母、数字、下划线、短横线`);

  if (!m.name?.trim()) errors.push('name 不能为空');

  for (const port of m.ports || []) {
    if (port < 1 || port > 65535) errors.push(`端口 ${port} 无效，必须在 1–65535`);
  }
  for (const s of m.services || []) {
    if (s.port != null && (s.port < 1 || s.port > 65535)) {
      errors.push(`服务「${s.name}」端口 ${s.port} 无效`);
    }
  }

  errors.push(...checkUrl('localWebUrl', m.localWebUrl, true));
  errors.push(...checkUrl('localHealthUrl', m.localHealthUrl, true));
  errors.push(...checkUrl('healthUrl', m.healthUrl, true));
  errors.push(...checkUrl('internalUrl', m.internalUrl, true));
  errors.push(...checkUrl('publicUrl', m.publicUrl, false));

  if (m.desktopStartCommand && DANGEROUS_CMD.test(m.desktopStartCommand)) {
    errors.push(`desktopStartCommand 含危险命令，已拒绝：${m.desktopStartCommand}`);
  }

  if (m.control?.enabled === false) {
    warnings.push(`项目「${m.name}」control.enabled=false，将跳过导入`);
  }

  return { ok: errors.length === 0, warnings, errors };
}

export function parsePortFromUrl(url?: string): number | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const p = Number(u.port);
    if (p >= 1 && p <= 65535) return p;
    if (!u.port && u.protocol === 'http:') return 80;
  } catch {
    const m = url.match(/:(\d{2,5})/);
    if (m) {
      const p = Number(m[1]);
      if (p >= 1 && p <= 65535) return p;
    }
  }
  return null;
}
