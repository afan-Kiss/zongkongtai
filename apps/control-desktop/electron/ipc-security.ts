import { BrowserWindow } from 'electron';
import path from 'path';
import { loadConfig, getConfigDir } from './config';
import { getLogDir } from './file-logger';
import { processManager } from './process-manager';

const ALLOWED_EXTERNAL_PREFIXES = ['http://127.0.0.1', 'http://localhost', 'http://8.137.126.18'];

const FORBIDDEN_URL = /^(file:|javascript:|data:|vbscript:)/i;

export function assertAllowedExternalUrl(raw: string): string {
  const url = String(raw || '').trim();
  if (!url) throw new Error('地址为空，无法打开');
  if (FORBIDDEN_URL.test(url)) {
    throw new Error('不允许打开 file://、javascript: 或 data: 链接');
  }
  if (/xiangyuzhubao\.xyz|wss:\/\//i.test(url)) {
    throw new Error('域名未备案前不允许使用域名或 wss 链接');
  }
  const ok = ALLOWED_EXTERNAL_PREFIXES.some((p) => url.startsWith(p));
  if (!ok) {
    throw new Error('只允许打开 127.0.0.1、localhost 或 8.137.126.18 开头的 http 地址');
  }
  return url;
}

function normalizeWin(p: string) {
  return path.normalize(p).replace(/\//g, '\\').toLowerCase();
}

export function assertAllowedOpenPath(raw: string, projectPaths: string[] = []): string {
  const target = path.resolve(String(raw || ''));
  if (!target || target.length < 3) throw new Error('路径无效');

  const allowedRoots = [
    getConfigDir(),
    getLogDir(),
    loadConfig().scanRoot,
    ...projectPaths.filter(Boolean),
  ]
    .map((p) => normalizeWin(path.resolve(p)))
    .filter(Boolean);

  const norm = normalizeWin(target);
  const allowed =
    allowedRoots.some((root) => norm === root || norm.startsWith(root + '\\')) ||
    norm.endsWith('deploy-output-credentials.txt');

  if (!allowed) {
    throw new Error('只能打开项目目录、配置目录或日志目录，不允许访问任意系统路径');
  }
  return target;
}

export function assertMoveWindowOptions(opts: unknown) {
  if (!opts || typeof opts !== 'object') throw new Error('窗口参数无效');
  const o = opts as Record<string, unknown>;
  if (o.hwnd != null) {
    const h = String(o.hwnd);
    if (!/^\d+$/.test(h)) throw new Error('窗口句柄 hwnd 无效');
  }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (o[key] != null) {
      const n = Number(o[key]);
      if (!Number.isFinite(n) || n < -10000 || n > 20000) {
        throw new Error(`窗口参数 ${key} 超出允许范围`);
      }
    }
  }
  return o;
}

export function assertTerminalSession(projectId: string) {
  if (!processManager.hasTerminal(projectId)) {
    throw new Error('终端尚未启动，请先启动项目后再写入命令');
  }
}

export function getWindowHwnd(win: BrowserWindow | null): string | undefined {
  if (!win) return undefined;
  const buf = win.getNativeWindowHandle();
  if (process.platform === 'win32') {
    return buf.readBigUInt64LE(0).toString();
  }
  return buf.readUInt32LE(0).toString();
}

export function pickSafeProjectPayload(detail: Record<string, unknown>) {
  return {
    id: String(detail.id || ''),
    name: String(detail.name || ''),
    code: detail.code as string | undefined,
    localPath: detail.localPath as string | null | undefined,
    desktopStartCommand: detail.desktopStartCommand as string | null | undefined,
    startCommand: detail.startCommand as string | null | undefined,
    devCommand: detail.devCommand as string | null | undefined,
    commands: detail.commands as
      | Array<{ type?: string; command?: string; cwd?: string | null; enabled?: boolean }>
      | undefined,
    ports: detail.ports as Array<{ port: number; role?: string }> | undefined,
  };
}
