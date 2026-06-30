import fs from 'fs';
import path from 'path';
import {
  filterGitPaths,
  suggestCommitMessage,
} from '../../../packages/control-shared/src/gitSecurity';
import type {
  GitFileChange,
  GitProjectStatus,
  GitRepoState,
} from '../../../packages/control-shared/src/steward';
import {
  normalizeRiskLevel,
  DEFAULT_RISK_BY_CODE,
} from '../../../packages/control-shared/src/steward';
import { readProjectManifest, getScanRoot } from './manifest-scanner';
import { listAllManifestEntries } from '../../../packages/control-shared/src/manifestFsScan';
import { runGit } from './async-exec';
import { fileLog } from './file-logger';

const GIT_TIMEOUT_MS = 3000;
const GIT_FETCH_TIMEOUT_MS = 15000;

function hasGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

function parsePorcelain(output: string): GitFileChange[] {
  const changes: GitFileChange[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim() || line.length < 3) continue;
    const status = line.slice(0, 2);
    let filePath = line.slice(2).trimStart();
    if (!filePath) continue;
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop()!.trim().replace(/^"|"$/g, '');
    } else {
      filePath = filePath.replace(/^"|"$/g, '');
    }
    changes.push({ path: filePath.replace(/\\/g, '/'), status: status.trim() || '?' });
  }
  return changes;
}

function validateGitAddPaths(
  localPath: string,
  paths: string[],
): { valid: string[]; skipped: Array<{ path: string; reason: string }> } {
  const valid: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  for (const relPath of paths) {
    const norm = relPath.replace(/\\/g, '/');
    const full = path.join(localPath, norm);
    if (/^ata\//.test(norm)) {
      const alt = path.join(localPath, `d${norm}`);
      if (fs.existsSync(alt)) {
        fileLog.app(`[git-upload] cwd=${localPath} add=${norm} exists=false path-anomaly`, 'warn');
        skipped.push({ path: norm, reason: '路径异常，已跳过（请刷新 Git 状态）' });
        continue;
      }
    }
    const exists = fs.existsSync(full);
    fileLog.app(`[git-upload] cwd=${localPath} add=${norm} exists=${exists}`);
    if (!exists) {
      skipped.push({ path: norm, reason: '文件已不存在，已跳过' });
      continue;
    }
    valid.push(norm);
  }
  return { valid, skipped };
}

function friendlyGitError(msg: string): string {
  if (/pathspec.*did not match any files/i.test(msg)) {
    return '有文件已不存在，已跳过。请刷新 Git 状态后再试。';
  }
  if (/rejected|non-fast-forward|fetch first/i.test(msg)) {
    return 'push 被拒绝，远端比本地新，请先 pull';
  }
  if (/conflict/i.test(msg)) return '有冲突，需要先手动解决';
  if (/path-anomaly|路径异常/i.test(msg)) return msg;
  return msg.slice(0, 200);
}

function detectState(opts: {
  hasRemote: boolean;
  dirty: boolean;
  unpushed: boolean;
  behind: boolean;
  hasGit: boolean;
}): GitRepoState {
  if (!opts.hasGit) return 'no_git';
  if (!opts.hasRemote) return 'no_remote';
  if (opts.behind && opts.dirty) return 'conflict';
  if (opts.behind) return 'needs_pull';
  if (opts.unpushed) return 'unpushed';
  if (opts.dirty) return 'dirty';
  return 'clean';
}

export async function getGitStatusForPath(
  opts: {
    projectCode: string;
    projectName: string;
    localPath: string;
    gitRemote?: string;
    fetchRemote?: boolean;
  },
  signal?: AbortSignal,
): Promise<GitProjectStatus> {
  const started = Date.now();
  const { projectCode, projectName, localPath } = opts;
  const base: GitProjectStatus = {
    projectCode,
    projectName,
    localPath,
    gitRemote: opts.gitRemote,
    state: 'no_git',
    hasUncommitted: false,
    hasUnpushed: false,
    isBehindRemote: false,
    addedCount: 0,
    modifiedCount: 0,
    deletedCount: 0,
    ignoredCount: 0,
    changes: [],
    safeToCommitPaths: [],
    blockedPaths: [],
    riskLevel: 'medium',
  };

  if (!localPath || !fs.existsSync(localPath)) {
    return { ...base, error: '本地路径不存在', state: 'no_git' };
  }
  if (!hasGitRepo(localPath)) {
    return { ...base, error: '没有 Git 仓库', state: 'no_git' };
  }

  try {
    const manifest = readProjectManifest(localPath);
    const riskLevel = resolveRiskLevel(projectCode, manifest?.riskLevel);
    base.riskLevel = riskLevel;

    const branch = await runGit(localPath, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      timeoutMs: GIT_TIMEOUT_MS,
      signal,
      label: 'rev-parse branch',
    });
    const headCommit = await runGit(localPath, ['rev-parse', 'HEAD'], {
      timeoutMs: GIT_TIMEOUT_MS,
      signal,
    });
    const headShort = await runGit(localPath, ['rev-parse', '--short', 'HEAD'], {
      timeoutMs: GIT_TIMEOUT_MS,
      signal,
    });

    let gitRemote = opts.gitRemote;
    try {
      gitRemote =
        gitRemote ||
        (await runGit(localPath, ['remote', 'get-url', 'origin'], {
          timeoutMs: GIT_TIMEOUT_MS,
          signal,
        }));
    } catch {
      /* no origin */
    }

    const porcelain = await runGit(localPath, ['status', '--porcelain'], {
      timeoutMs: GIT_TIMEOUT_MS,
      signal,
    });
    const changes = parsePorcelain(porcelain);
    const addedCount = changes.filter((c) => c.status.includes('A') || c.status === '??').length;
    const modifiedCount = changes.filter((c) => /M/.test(c.status)).length;
    const deletedCount = changes.filter((c) => /D/.test(c.status)).length;

    let ignoredCount = 0;

    const changePaths = changes.map((c) => c.path);
    const { safe, blocked } = filterGitPaths(changePaths, { riskLevel });
    const blockedPaths = blocked.map((b) => ({
      path: b.path,
      status: changes.find((c) => c.path === b.path)?.status || '?',
      blocked: true,
      blockReason: b.reason,
    }));
    const changesWithFlags = changes.map((c) => {
      const hit = blockedPaths.find((b) => b.path === c.path);
      return hit ? { ...c, blocked: true, blockReason: hit.blockReason } : c;
    });

    let unpushed = false;
    let behind = false;

    if (gitRemote && opts.fetchRemote) {
      try {
        await runGit(localPath, ['fetch', 'origin', branch, '--quiet'], {
          timeoutMs: GIT_FETCH_TIMEOUT_MS,
          signal,
          label: 'fetch',
        });
      } catch {
        /* offline ok */
      }
    }

    if (gitRemote) {
      try {
        const aheadBehind = await runGit(
          localPath,
          ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`],
          { timeoutMs: GIT_TIMEOUT_MS, signal },
        );
        const [behindStr, aheadStr] = aheadBehind.split(/\s+/);
        behind = Number(behindStr) > 0;
        unpushed = Number(aheadStr) > 0;
      } catch {
        try {
          const unpushedLog = await runGit(
            localPath,
            ['log', `origin/${branch}..HEAD`, '--oneline'],
            {
              timeoutMs: GIT_TIMEOUT_MS,
              signal,
            },
          );
          unpushed = !!unpushedLog.trim();
        } catch {
          unpushed = changes.length > 0;
        }
      }
    }

    const dirty = changes.length > 0;
    const state = detectState({
      hasRemote: !!gitRemote,
      dirty,
      unpushed,
      behind,
      hasGit: true,
    });

    fileLog.app(`[git] 项目=${projectName} status=ok duration=${Date.now() - started}ms`);

    return {
      ...base,
      gitRemote,
      branch,
      headCommit,
      headShort,
      state,
      hasUncommitted: dirty,
      hasUnpushed: unpushed,
      isBehindRemote: behind,
      addedCount,
      modifiedCount,
      deletedCount,
      ignoredCount,
      changes: changesWithFlags,
      safeToCommitPaths: safe,
      blockedPaths,
      riskLevel,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = /超时|timeout/i.test(msg);
    fileLog.app(
      `[git] 项目=${projectName} status=${isTimeout ? 'timeout' : 'error'} duration=${Date.now() - started}ms ${msg}`,
      isTimeout ? 'warn' : 'error',
    );
    return {
      ...base,
      error: isTimeout ? 'Git 检查超时，已跳过' : msg.slice(0, 300),
      state: 'no_git',
    };
  }
}

export async function countGitIgnoredFiles(
  localPath: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; ignoredCount: number; error?: string }> {
  if (!localPath || !fs.existsSync(localPath) || !hasGitRepo(localPath)) {
    return { ok: false, ignoredCount: 0, error: '没有 Git 仓库' };
  }
  try {
    const ign = await runGit(localPath, ['status', '--porcelain', '--ignored'], {
      timeoutMs: 15000,
      signal,
      label: 'status ignored',
    });
    const ignoredCount = ign.split(/\r?\n/).filter((l) => l.startsWith('!!')).length;
    return { ok: true, ignoredCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      ignoredCount: 0,
      error: /超时|timeout/i.test(msg) ? '统计 ignored 超时' : msg.slice(0, 200),
    };
  }
}

export function collectGitProjects(
  projects: Array<{
    code: string;
    name: string;
    localPath?: string | null;
    gitRemote?: string | null;
  }>,
): Array<{ projectCode: string; projectName: string; localPath: string; gitRemote?: string }> {
  const seen = new Set<string>();
  const list: Array<{
    projectCode: string;
    projectName: string;
    localPath: string;
    gitRemote?: string;
  }> = [];

  for (const p of projects) {
    if (!p.localPath) continue;
    const key = path.resolve(p.localPath).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      projectCode: p.code,
      projectName: p.name,
      localPath: p.localPath,
      gitRemote: p.gitRemote || undefined,
    });
  }

  const scanRoot = getScanRoot();
  if (scanRoot && fs.existsSync(scanRoot)) {
    const { manifests, warnings } = listAllManifestEntries(scanRoot);
    for (const w of warnings) {
      fileLog.app(`[git-scan] ${w}`, 'warn');
    }
    const byCode = new Map<string, string>();
    for (const manifest of manifests) {
      const dir = manifest.localPath;
      if (!dir || !fs.existsSync(dir)) continue;
      const key = path.resolve(dir).toLowerCase();
      if (seen.has(key)) continue;
      const prevPath = byCode.get(manifest.code);
      if (prevPath && prevPath !== key) {
        fileLog.app(`[git-scan] code「${manifest.code}」路径冲突：${prevPath} 与 ${dir}`, 'warn');
      }
      byCode.set(manifest.code, key);
      seen.add(key);
      list.push({
        projectCode: manifest.code,
        projectName: manifest.name,
        localPath: dir,
        gitRemote: manifest.gitRemote,
      });
    }
  }

  return list.sort((a, b) => a.projectName.localeCompare(b.projectName, 'zh-CN'));
}

export async function listGitStatusesAsync(
  projects: Parameters<typeof collectGitProjects>[0],
  opts?: {
    fetchRemote?: boolean;
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (payload: {
      index: number;
      total: number;
      status: GitProjectStatus;
      results: GitProjectStatus[];
    }) => void;
  },
): Promise<GitProjectStatus[]> {
  const items = collectGitProjects(projects);
  const total = items.length;
  const results: GitProjectStatus[] = [];
  const concurrency = opts?.concurrency ?? 2;
  let index = 0;

  async function worker() {
    while (index < total) {
      if (opts?.signal?.aborted) break;
      const i = index++;
      const item = items[i];
      const status = await getGitStatusForPath(
        { ...item, fetchRemote: opts?.fetchRemote },
        opts?.signal,
      );
      results.push(status);
      opts?.onProgress?.({ index: i + 1, total, status, results: [...results] });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total || 1) }, () => worker()));
  return results.sort((a, b) => a.projectName.localeCompare(b.projectName, 'zh-CN'));
}

export interface GitCommitPushResult {
  ok: boolean;
  message: string;
  commitHash?: string;
  branch?: string;
  remote?: string;
  pushed?: boolean;
  skipped?: Array<{ path: string; reason: string }>;
  blocked?: Array<{ path: string; reason: string }>;
}

/** 主进程最终安全过滤 — 不信任前端传入的 paths */
function finalizeGitCommitPaths(
  localPath: string,
  rawPaths: string[],
): {
  safe: string[];
  blocked: Array<{ path: string; reason: string }>;
  riskLevel: string;
} {
  const manifest = readProjectManifest(localPath);
  const riskLevel = resolveRiskLevel(
    manifest?.code || path.basename(localPath),
    manifest?.riskLevel,
  );
  const { safe, blocked } = filterGitPaths(rawPaths, { riskLevel });
  return { safe, blocked, riskLevel };
}

export async function gitCommitAndPush(
  opts: {
    localPath: string;
    message?: string;
    paths?: string[];
    pushOnly?: boolean;
  },
  signal?: AbortSignal,
): Promise<GitCommitPushResult> {
  const { localPath } = opts;
  if (!hasGitRepo(localPath)) return { ok: false, message: '没有 Git 仓库' };

  const branch = await runGit(localPath, ['rev-parse', '--abbrev-ref', 'HEAD'], {
    timeoutMs: GIT_TIMEOUT_MS,
    signal,
  });
  let remote = '';
  try {
    remote = await runGit(localPath, ['remote', 'get-url', 'origin'], {
      timeoutMs: GIT_TIMEOUT_MS,
      signal,
    });
  } catch {
    return { ok: false, message: '远端地址没配置' };
  }

  let commitSkipped: Array<{ path: string; reason: string }> = [];
  let commitBlocked: Array<{ path: string; reason: string }> = [];

  if (!opts.pushOnly) {
    const porcelain = await runGit(localPath, ['status', '--porcelain'], {
      timeoutMs: GIT_TIMEOUT_MS,
      signal,
    });
    const changes = parsePorcelain(porcelain);
    if (!changes.length) return { ok: false, message: '没有可提交改动' };

    const rawPaths = opts.paths?.length ? opts.paths : changes.map((c) => c.path);
    const finalized = finalizeGitCommitPaths(localPath, rawPaths);
    commitBlocked = finalized.blocked;
    if (finalized.blocked.length) {
      fileLog.app(
        `[git-upload] main-process blocked ${finalized.blocked.length} paths (risk=${finalized.riskLevel})`,
        'warn',
      );
    }

    const { valid, skipped } = validateGitAddPaths(localPath, finalized.safe);
    commitSkipped = skipped;
    if (!valid.length) {
      const hint = skipped.length
        ? skipped
            .map((s) => `${s.path}（${s.reason}）`)
            .slice(0, 3)
            .join('；')
        : '';
      return {
        ok: false,
        message: hint ? `没有可安全提交的文件。${hint}` : '没有可安全提交的文件。',
        skipped: commitSkipped,
        blocked: commitBlocked,
      };
    }

    for (const p of valid) {
      try {
        await runGit(localPath, ['add', '--', p], { timeoutMs: GIT_TIMEOUT_MS, signal });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        fileLog.app(`[git-upload] add failed path=${p} ${msg}`, 'warn');
        commitSkipped.push({ path: p, reason: friendlyGitError(msg) });
      }
    }

    const staged = (
      await runGit(localPath, ['diff', '--cached', '--name-only'], {
        timeoutMs: GIT_TIMEOUT_MS,
        signal,
      })
    ).trim();
    if (!staged) {
      return {
        ok: false,
        message: '没有可安全提交的文件。',
        skipped: commitSkipped,
        blocked: commitBlocked,
      };
    }

    const msg = (opts.message || '').trim() || suggestCommitMessage(valid);
    await runGit(localPath, ['commit', '-m', msg], { timeoutMs: 10000, signal });
    if (commitSkipped.length) {
      fileLog.app(`[git-upload] skipped ${commitSkipped.length} paths during commit`, 'warn');
    }
  } else {
    const unpushed = (
      await runGit(localPath, ['log', `@{u}..HEAD`, '--oneline'], {
        timeoutMs: GIT_TIMEOUT_MS,
        signal,
      })
    ).trim();
    const dirty = (
      await runGit(localPath, ['status', '--porcelain'], { timeoutMs: GIT_TIMEOUT_MS, signal })
    ).trim();
    if (!unpushed && dirty) return { ok: false, message: '有未提交改动，请先提交再 push' };
    if (!unpushed && !dirty) return { ok: false, message: '没有未 push 的 commit' };
  }

  try {
    await runGit(localPath, ['push', 'origin', branch], {
      timeoutMs: 60000,
      signal,
      label: 'push',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/rejected|non-fast-forward|fetch first/i.test(msg)) {
      return { ok: false, message: 'push 被拒绝，远端比本地新，请先 pull' };
    }
    return { ok: false, message: friendlyGitError(msg) };
  }

  const commitHash = await runGit(localPath, ['rev-parse', '--short', 'HEAD'], {
    timeoutMs: GIT_TIMEOUT_MS,
    signal,
  });
  return {
    ok: true,
    message:
      commitSkipped.length > 0
        ? `已 push 到 origin/${branch}（已跳过 ${commitSkipped.length} 个文件）`
        : `已 push 到 origin/${branch}`,
    commitHash,
    branch,
    remote,
    pushed: true,
    skipped: commitSkipped.length ? commitSkipped : undefined,
    blocked: commitBlocked.length ? commitBlocked : undefined,
  };
}

export async function gitPullLatest(
  localPath: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string }> {
  if (!hasGitRepo(localPath)) return { ok: false, message: '没有 Git 仓库' };
  const branch = await runGit(localPath, ['rev-parse', '--abbrev-ref', 'HEAD'], {
    timeoutMs: GIT_TIMEOUT_MS,
    signal,
  });
  try {
    await runGit(localPath, ['pull', '--rebase', 'origin', branch], {
      timeoutMs: 60000,
      signal,
      label: 'pull',
    });
    return { ok: true, message: '已 pull 最新代码' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/conflict/i.test(msg)) return { ok: false, message: '有冲突，需要先手动解决' };
    return { ok: false, message: msg.slice(0, 300) };
  }
}

export function resolveRiskLevel(code: string, manifestRisk?: string): string {
  if (manifestRisk) return normalizeRiskLevel(manifestRisk);
  return DEFAULT_RISK_BY_CODE[code] || 'medium';
}

export function githubUrlFromRemote(remote?: string): string | null {
  if (!remote) return null;
  const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/i);
  if (!m) return null;
  return `https://github.com/${m[1]}`;
}

/** @deprecated 同步接口已移除，请用 listGitStatusesAsync */
export function listGitStatuses(
  projects: Parameters<typeof collectGitProjects>[0],
): GitProjectStatus[] {
  void projects;
  throw new Error('listGitStatuses 已废弃，请使用 git:list 后台任务');
}
