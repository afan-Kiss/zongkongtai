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
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim() || '?';
    const filePath = line.slice(3).trim();
    if (!filePath) continue;
    changes.push({ path: filePath.replace(/\\/g, '/'), status });
  }
  return changes;
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
  };

  if (!localPath || !fs.existsSync(localPath)) {
    return { ...base, error: '本地路径不存在', state: 'no_git' };
  }
  if (!hasGitRepo(localPath)) {
    return { ...base, error: '没有 Git 仓库', state: 'no_git' };
  }

  try {
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
    const { safe, blocked } = filterGitPaths(changePaths);
    const blockedPaths = blocked.map((b) => ({
      path: b.path,
      status: changes.find((c) => c.path === b.path)?.status || '?',
      blocked: true,
      blockReason: b.reason,
    }));

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
      changes,
      safeToCommitPaths: safe,
      blockedPaths,
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

  if (!opts.pushOnly) {
    const porcelain = await runGit(localPath, ['status', '--porcelain'], {
      timeoutMs: GIT_TIMEOUT_MS,
      signal,
    });
    const changes = parsePorcelain(porcelain);
    if (!changes.length) return { ok: false, message: '没有可提交改动' };

    const paths = opts.paths?.length ? opts.paths : filterGitPaths(changes.map((c) => c.path)).safe;
    if (!paths.length) return { ok: false, message: '改动文件均在敏感列表中，已阻止提交' };

    for (const p of paths) {
      await runGit(localPath, ['add', '--', p], { timeoutMs: GIT_TIMEOUT_MS, signal });
    }

    const msg = (opts.message || '').trim() || suggestCommitMessage(paths);
    await runGit(localPath, ['commit', '-m', msg], { timeoutMs: 10000, signal });
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
    return { ok: false, message: msg.slice(0, 300) };
  }

  const commitHash = await runGit(localPath, ['rev-parse', '--short', 'HEAD'], {
    timeoutMs: GIT_TIMEOUT_MS,
    signal,
  });
  return {
    ok: true,
    message: `已 push 到 origin/${branch}`,
    commitHash,
    branch,
    remote,
    pushed: true,
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
