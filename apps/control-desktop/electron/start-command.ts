import fs from 'fs';
import path from 'path';
import { MANIFEST_FILENAME } from '../../../packages/control-shared/src/manifest';
import { isQianfanRelayProject } from './external-project-status';

const STALE_PATH_RE =
  /[\\/]archive[\\/]|[\\/]backup[\\/]|[\\/]dist[\\/]|[\\/]old[\\/]|[\\/]历史|[\\/]备份|_old[\\/]|_backup[\\/]/i;

export interface StartCommandResult {
  command: string;
  cwd: string;
  type: 'desktop' | 'dev' | 'start' | 'npm';
  source: string;
}

export interface StartCommandValidation {
  ok: boolean;
  message: string;
  resolved?: StartCommandResult;
  stalePath?: boolean;
  manifestMissing?: boolean;
  commandMissing?: boolean;
}

function wrapUtf8(command: string) {
  if (/^chcp\s/i.test(command)) return command;
  return `chcp 65001 >nul & ${command}`;
}

export function isStaleProjectPath(localPath?: string | null): boolean {
  if (!localPath) return false;
  const norm = path.normalize(localPath);
  return STALE_PATH_RE.test(norm);
}

export function resolveManifestStartCommand(project: {
  id?: string;
  name?: string;
  code?: string;
  localPath?: string | null;
  desktopStartCommand?: string | null;
  startCommand?: string | null;
  devCommand?: string | null;
  commands?: Array<{ type?: string; command?: string; cwd?: string | null; enabled?: boolean }>;
}): StartCommandResult | null {
  if (project.desktopStartCommand?.trim()) {
    return {
      command: wrapUtf8(project.desktopStartCommand.trim()),
      cwd: project.localPath || process.cwd(),
      type: 'desktop',
      source: 'manifest.desktopStartCommand',
    };
  }

  const cmdProfile = project.commands?.find((c) => c.enabled !== false && c.type === 'desktop');
  if (cmdProfile?.command?.trim()) {
    return {
      command: wrapUtf8(cmdProfile.command.trim()),
      cwd: cmdProfile.cwd || project.localPath || process.cwd(),
      type: 'desktop',
      source: 'manifest.commands.desktop',
    };
  }

  if (project.devCommand?.trim()) {
    return {
      command: wrapUtf8(project.devCommand.trim()),
      cwd: project.localPath || process.cwd(),
      type: 'dev',
      source: 'manifest.devCommand',
    };
  }

  if (project.startCommand?.trim()) {
    return {
      command: wrapUtf8(project.startCommand.trim()),
      cwd: project.localPath || process.cwd(),
      type: 'start',
      source: 'manifest.startCommand',
    };
  }

  const npmProfile = project.commands?.find((c) => c.enabled !== false && c.type === 'npm');
  if (npmProfile?.command?.trim()) {
    return {
      command: wrapUtf8(npmProfile.command.trim()),
      cwd: npmProfile.cwd || project.localPath || process.cwd(),
      type: 'npm',
      source: 'manifest.commands.npm',
    };
  }

  return null;
}

/** 千帆：若 manifest 未声明启动命令，使用当前仓库认可的一键入口 */
export function enrichQianfanStartCommand<T extends Record<string, unknown>>(project: T): T {
  if (!isQianfanRelayProject(project as { code?: string; name?: string })) return project;
  const localPath = String(project.localPath || '');
  if (!localPath) return project;
  if (project.desktopStartCommand || project.startCommand || project.devCommand) return project;

  const oneClick = path.join(localPath, 'wxbot-new-oneclick.js');
  if (fs.existsSync(oneClick)) {
    return {
      ...project,
      desktopStartCommand: 'node wxbot-new-oneclick.js',
    };
  }
  return project;
}

export function validateProjectStartCommand(project: {
  id?: string;
  name?: string;
  code?: string;
  localPath?: string | null;
  desktopStartCommand?: string | null;
  startCommand?: string | null;
  devCommand?: string | null;
  commands?: Array<{ type?: string; command?: string; cwd?: string | null; enabled?: boolean }>;
}): StartCommandValidation {
  const enriched = enrichQianfanStartCommand(project);
  if (!enriched.localPath) {
    return { ok: false, message: '未配置本地目录', commandMissing: true };
  }
  if (!fs.existsSync(enriched.localPath)) {
    return { ok: false, message: `本地目录不存在：${enriched.localPath}` };
  }
  if (isStaleProjectPath(enriched.localPath)) {
    return {
      ok: false,
      message: '路径疑似 archive/backup/old 历史目录，请修正 manifest localPath',
      stalePath: true,
    };
  }

  const manifestPath = path.join(enriched.localPath, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      message: `未找到 ${MANIFEST_FILENAME}`,
      manifestMissing: true,
    };
  }

  const resolved = resolveManifestStartCommand(enriched);
  if (!resolved) {
    return {
      ok: false,
      message:
        '未配置启动命令，请在 manifest 中填写 desktopStartCommand / devCommand / startCommand',
      commandMissing: true,
    };
  }

  if (!fs.existsSync(resolved.cwd)) {
    return { ok: false, message: `工作目录不存在：${resolved.cwd}` };
  }

  const cmdLower = resolved.command.toLowerCase();
  if (/[\\/]archive[\\/]|[\\/]backup[\\/]|[\\/]old[\\/]/i.test(resolved.command)) {
    return { ok: false, message: '启动命令指向历史/备份路径，请更新 manifest', stalePath: true };
  }

  if (isQianfanRelayProject(enriched)) {
    const allowed =
      /wxbot-new-oneclick|wxbot|qianfan|qiqiren/i.test(resolved.command) ||
      resolved.source.includes('manifest');
    if (!allowed && /\.bat|\.exe/i.test(resolved.command)) {
      return {
        ok: false,
        message: '千帆项目不应使用未在 manifest 声明的旧 BAT/EXE 入口',
        stalePath: true,
      };
    }
    void cmdLower;
  }

  return {
    ok: true,
    message: `使用 ${resolved.source}：${resolved.command.replace(/^chcp 65001 >nul & /i, '')}`,
    resolved,
  };
}
