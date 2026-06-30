/** Git 提交安全过滤 — 禁止敏感/构建产物/运行数据进入 commit */

const BLOCKED_SEGMENTS = [
  'node_modules',
  'dist',
  'build',
  'dist-desktop',
  'win-unpacked',
  '.git',
  '__pycache__',
  'coverage',
  '.next',
  '.turbo',
  'data',
  'runtime',
  'temp',
  'tmp',
  'cache',
  'logs',
];

const ALLOWED_BASENAMES = new Set(['package.json', 'tsconfig.json', 'zhubo-control.manifest.json']);

const BLOCKED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(^|[\\/])\.env$/i, reason: '.env 含密钥，禁止提交' },
  { re: /(^|[\\/])\.env\./i, reason: '.env.* 含密钥，禁止提交' },
  { re: /\.(db|sqlite|sqlite3)$/i, reason: '数据库文件禁止提交' },
  { re: /deploy-output-credentials\.txt$/i, reason: '部署凭据文件禁止提交' },
  { re: /(^|[\\/])cookie/i, reason: 'Cookie 相关文件禁止提交' },
  { re: /token/i, reason: 'Token 相关文件禁止提交' },
  { re: /password/i, reason: '密码相关文件禁止提交' },
  { re: /\.(log)$/i, reason: '日志/调试样本，默认不上传' },
  { re: /\.(jsonl)$/i, reason: '日志/调试样本，默认不上传' },
  { re: /sample.*\.json$/i, reason: '日志/调试样本，默认不上传' },
  { re: /debug.*\.json$/i, reason: '日志/调试样本，默认不上传' },
  { re: /\.(pem|key|p12|pfx)$/i, reason: '证书/密钥禁止提交' },
];

export interface GitPathFilterOptions {
  riskLevel?: string;
}

export interface GitPathFilterResult {
  safe: string[];
  blocked: Array<{ path: string; reason: string }>;
}

function segmentBlockReason(seg: string): string {
  if (seg === 'data') return '运行数据目录 data，默认不上传';
  if (seg === 'logs') return '日志/调试样本，默认不上传';
  if (seg === 'runtime' || seg === 'temp' || seg === 'tmp' || seg === 'cache') {
    return `运行数据目录 ${seg}，默认不上传`;
  }
  return `路径含 ${seg}，已排除`;
}

export function isGitPathBlocked(relPath: string, opts?: GitPathFilterOptions): string | null {
  const norm = relPath.replace(/\\/g, '/');
  const normLower = norm.toLowerCase();
  const parts = normLower.split('/');
  const base = parts[parts.length - 1] || '';

  if (ALLOWED_BASENAMES.has(base)) return null;
  if (/zhubo-control\.manifest\.json$/i.test(base)) return null;

  for (const seg of BLOCKED_SEGMENTS) {
    if (parts.includes(seg)) return segmentBlockReason(seg);
  }

  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(norm)) return reason;
  }

  if (opts?.riskLevel === 'high' || opts?.riskLevel === 'protected') {
    if (/^data\//.test(normLower) && /\.json$/i.test(base)) {
      return '高风险项目：data 下 JSON 默认不上传';
    }
  }

  return null;
}

export function filterGitPaths(paths: string[], opts?: GitPathFilterOptions): GitPathFilterResult {
  const safe: string[] = [];
  const blocked: Array<{ path: string; reason: string }> = [];
  for (const p of paths) {
    const reason = isGitPathBlocked(p, opts);
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
