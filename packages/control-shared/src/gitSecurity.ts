/** Git 提交安全过滤 — 禁止敏感/构建产物进入 commit */

const BLOCKED_SEGMENTS = [
  'node_modules',
  'dist',
  'build',
  'dist-desktop',
  'win-unpacked',
  'logs',
  '.git',
  '__pycache__',
  'coverage',
  '.next',
  '.turbo',
];

const BLOCKED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(^|[\\/])\.env$/i, reason: '.env 含密钥，禁止提交' },
  { re: /(^|[\\/])\.env\./i, reason: '.env.* 含密钥，禁止提交' },
  { re: /\.(db|sqlite|sqlite3)$/i, reason: '数据库文件禁止提交' },
  { re: /deploy-output-credentials\.txt$/i, reason: '部署凭据文件禁止提交' },
  { re: /(^|[\\/])cookie/i, reason: 'Cookie 相关文件禁止提交' },
  { re: /token/i, reason: 'Token 相关文件禁止提交' },
  { re: /password/i, reason: '密码相关文件禁止提交' },
  { re: /\.(log)$/i, reason: '日志文件不建议提交' },
  { re: /\.(pem|key|p12|pfx)$/i, reason: '证书/密钥禁止提交' },
];

export interface GitPathFilterResult {
  safe: string[];
  blocked: Array<{ path: string; reason: string }>;
}

export function isGitPathBlocked(relPath: string): string | null {
  const norm = relPath.replace(/\\/g, '/');
  for (const seg of BLOCKED_SEGMENTS) {
    if (norm.split('/').includes(seg)) return `路径含 ${seg}，已排除`;
  }
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(norm)) return reason;
  }
  return null;
}

export function filterGitPaths(paths: string[]): GitPathFilterResult {
  const safe: string[] = [];
  const blocked: Array<{ path: string; reason: string }> = [];
  for (const p of paths) {
    const reason = isGitPathBlocked(p);
    if (reason) blocked.push({ path: p, reason });
    else safe.push(p);
  }
  return { safe, blocked };
}

export function suggestCommitMessage(changedPaths: string[]): string {
  const joined = changedPaths.join(' ').toLowerCase();
  if (/manifest/.test(joined)) return 'feat: update manifest integration';
  if (/health|port|4790|4791/.test(joined)) return 'fix: repair control health check';
  if (/readme|docs/.test(joined)) return 'docs: update project documentation';
  if (/deploy|nginx|pm2/.test(joined)) return 'chore: update deployment config';
  if (/test|spec/.test(joined)) return 'test: update tests';
  return 'chore: update project config';
}
