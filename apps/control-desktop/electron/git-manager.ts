import { execFileSync } from 'child_process';
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

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const msg = String(err.stderr || err.stdout || err.message || e);
    throw new Error(msg.trim().slice(0, 500));
  }
}

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

function countIgnored(cwd: string): number {
  try {
    const out = runGit(cwd, ['status', '--porcelain', '--ignored']);
    return out.split(/\r?\n/).filter((l) => l.startsWith('!!')).length;
  } catch {
    return 0;
  }
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

export function getGitStatusForPath(opts: {
  projectCode: string;
  projectName: string;
  localPath: string;
  gitRemote?: string;
}): GitProjectStatus {
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
    const branch = runGit(localPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const headCommit = runGit(localPath, ['rev-parse', 'HEAD']);
    const headShort = runGit(localPath, ['rev-parse', '--short', 'HEAD']);
    let gitRemote = opts.gitRemote;
    try {
      gitRemote = gitRemote || runGit(localPath, ['remote', 'get-url', 'origin']);
    } catch {
      /* no origin */
    }

    const porcelain = runGit(localPath, ['status', '--porcelain']);
    const changes = parsePorcelain(porcelain);
    const addedCount = changes.filter((c) => c.status.includes('A') || c.status === '??').length;
    const modifiedCount = changes.filter((c) => /M/.test(c.status)).length;
    const deletedCount = changes.filter((c) => /D/.test(c.status)).length;
    const ignoredCount = countIgnored(localPath);

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
    if (gitRemote) {
      try {
        runGit(localPath, ['fetch', 'origin', branch, '--quiet']);
      } catch {
        /* offline ok */
      }
      try {
        const aheadBehind = runGit(localPath, [
          'rev-list',
          '--left-right',
          '--count',
          `origin/${branch}...HEAD`,
        ]);
        const [behindStr, aheadStr] = aheadBehind.split(/\s+/);
        behind = Number(behindStr) > 0;
        unpushed = Number(aheadStr) > 0;
      } catch {
        try {
          const unpushedLog = runGit(localPath, ['log', `origin/${branch}..HEAD`, '--oneline']);
          unpushed = !!unpushedLog.trim();
        } catch {
          unpushed = porcelain.length > 0;
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
    return {
      ...base,
      error: e instanceof Error ? e.message : String(e),
      state: 'no_git',
    };
  }
}

export function listGitStatuses(
  projects: Array<{
    code: string;
    name: string;
    localPath?: string | null;
    gitRemote?: string | null;
  }>,
): GitProjectStatus[] {
  const seen = new Set<string>();
  const results: GitProjectStatus[] = [];
  const scanRoot = getScanRoot();

  for (const p of projects) {
    if (!p.localPath) continue;
    const key = path.resolve(p.localPath).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(
      getGitStatusForPath({
        projectCode: p.code,
        projectName: p.name,
        localPath: p.localPath,
        gitRemote: p.gitRemote || undefined,
      }),
    );
  }

  if (scanRoot && fs.existsSync(scanRoot)) {
    for (const ent of fs.readdirSync(scanRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(scanRoot, ent.name);
      const manifest = readProjectManifest(dir);
      if (!manifest) continue;
      const key = path.resolve(dir).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(
        getGitStatusForPath({
          projectCode: manifest.code,
          projectName: manifest.name,
          localPath: dir,
          gitRemote: manifest.gitRemote,
        }),
      );
    }
  }

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

export function gitCommitAndPush(opts: {
  localPath: string;
  message?: string;
  paths?: string[];
  pushOnly?: boolean;
}): GitCommitPushResult {
  const { localPath } = opts;
  if (!hasGitRepo(localPath)) {
    return { ok: false, message: '没有 Git 仓库' };
  }

  const branch = runGit(localPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  let remote = '';
  try {
    remote = runGit(localPath, ['remote', 'get-url', 'origin']);
  } catch {
    return { ok: false, message: '远端地址没配置' };
  }

  if (!opts.pushOnly) {
    const porcelain = runGit(localPath, ['status', '--porcelain']);
    const changes = parsePorcelain(porcelain);
    if (!changes.length) {
      return { ok: false, message: '没有可提交改动' };
    }

    const paths = opts.paths?.length ? opts.paths : filterGitPaths(changes.map((c) => c.path)).safe;
    if (!paths.length) {
      return { ok: false, message: '改动文件均在敏感列表中，已阻止提交' };
    }

    for (const p of paths) {
      runGit(localPath, ['add', '--', p]);
    }

    const msg = (opts.message || '').trim() || suggestCommitMessage(paths);
    runGit(localPath, ['commit', '-m', msg]);
  } else {
    const unpushed = runGit(localPath, ['log', `@{u}..HEAD`, '--oneline']).trim();
    const dirty = runGit(localPath, ['status', '--porcelain']).trim();
    if (!unpushed && dirty) {
      return { ok: false, message: '有未提交改动，请先提交再 push' };
    }
    if (!unpushed && !dirty) {
      return { ok: false, message: '没有未 push 的 commit' };
    }
  }

  try {
    runGit(localPath, ['push', 'origin', branch]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/rejected|non-fast-forward|fetch first/i.test(msg)) {
      return { ok: false, message: 'push 被拒绝，远端比本地新，请先 pull' };
    }
    return { ok: false, message: msg.slice(0, 300) };
  }

  const commitHash = runGit(localPath, ['rev-parse', '--short', 'HEAD']);
  return {
    ok: true,
    message: `已 push 到 origin/${branch}`,
    commitHash,
    branch,
    remote,
    pushed: true,
  };
}

export function gitPullLatest(localPath: string): { ok: boolean; message: string } {
  if (!hasGitRepo(localPath)) return { ok: false, message: '没有 Git 仓库' };
  const branch = runGit(localPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  try {
    runGit(localPath, ['pull', '--rebase', 'origin', branch]);
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
  return `http://github.com/${m[1]}`;
}
