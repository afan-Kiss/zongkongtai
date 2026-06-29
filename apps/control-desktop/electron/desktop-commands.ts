import fs from 'fs';
import path from 'path';
import { getConfigDir } from './config';

export interface DesktopCommandEntry {
  command: string;
  cwd?: string | null;
  localWebUrl?: string | null;
  note?: string;
}

type CommandMap = Record<string, DesktopCommandEntry>;

const DEFAULTS: CommandMap = {
  辅助出库软件: {
    command: 'dist\\库存出入库辅助.exe',
    note: 'PyInstaller GUI，会弹出独立窗口，无内嵌终端日志',
  },
  祥钰系统: {
    command: 'node server/index.js',
    localWebUrl: 'http://127.0.0.1:4726',
    note: '本地桌面直接启动 Web 服务',
  },
  扫码枪登记出入库系统: {
    command: 'npm run dev',
    localWebUrl: 'http://127.0.0.1:5173',
    note: '桌面版 dev：web 5173 + server 4725',
  },
  记账系统: {
    command: 'npm run dev',
    localWebUrl: 'http://127.0.0.1:5173',
    note: '桌面版用 dev 同时启动 web(5173)+server(3001)',
  },
};

function bundledDefaultsPath() {
  return path.join(__dirname, 'desktop-commands.defaults.json');
}

function userOverridesPath() {
  return path.join(getConfigDir(), 'desktop-commands.json');
}

function readJsonMap(file: string): CommandMap {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CommandMap;
  } catch {
    return {};
  }
}

export function getDesktopCommandMap(): CommandMap {
  const bundled = readJsonMap(bundledDefaultsPath());
  return { ...DEFAULTS, ...bundled, ...readJsonMap(userOverridesPath()) };
}

export function saveUserDesktopCommands(map: CommandMap) {
  fs.mkdirSync(getConfigDir(), { recursive: true });
  fs.writeFileSync(userOverridesPath(), JSON.stringify(map, null, 2), 'utf8');
}

function lookupEntry(project: { id?: string; name?: string; code?: string }): DesktopCommandEntry | null {
  const map = getDesktopCommandMap();
  const keys = [project.code, project.name, project.id].filter(Boolean) as string[];
  for (const key of keys) {
    if (map[key]) return map[key];
  }
  return null;
}

export function resolveDesktopStartCommand(project: {
  id?: string;
  name?: string;
  code?: string;
  localPath?: string | null;
  desktopStartCommand?: string | null;
  startCommand?: string | null;
  devCommand?: string | null;
  commands?: Array<{ type?: string; command?: string; cwd?: string | null; enabled?: boolean }>;
}): { command: string; cwd: string; type: 'desktop' | 'dev' | 'start' | 'npm' } | null {
  if (project.desktopStartCommand?.trim()) {
    return {
      command: wrapUtf8(project.desktopStartCommand.trim()),
      cwd: project.localPath || process.cwd(),
      type: 'desktop',
    };
  }

  const cmdProfile = project.commands?.find((c) => c.enabled !== false && c.type === 'desktop');
  if (cmdProfile?.command?.trim()) {
    return {
      command: wrapUtf8(cmdProfile.command.trim()),
      cwd: cmdProfile.cwd || project.localPath || process.cwd(),
      type: 'desktop',
    };
  }

  const local = lookupEntry(project);
  if (local?.command?.trim()) {
    return {
      command: wrapUtf8(local.command.trim()),
      cwd: local.cwd || project.localPath || process.cwd(),
      type: 'desktop',
    };
  }

  if (project.devCommand?.trim()) {
    return {
      command: wrapUtf8(project.devCommand.trim()),
      cwd: project.localPath || process.cwd(),
      type: 'dev',
    };
  }

  if (project.startCommand?.trim()) {
    return {
      command: wrapUtf8(project.startCommand.trim()),
      cwd: project.localPath || process.cwd(),
      type: 'start',
    };
  }

  if (project.localPath) {
    const pkgPath = path.join(project.localPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const scripts = pkg.scripts || {};
        if (scripts.dev) return { command: wrapUtf8('npm run dev'), cwd: project.localPath, type: 'npm' };
        if (scripts.start) return { command: wrapUtf8('npm run start'), cwd: project.localPath, type: 'npm' };
      } catch {
        /* ignore */
      }
    }
  }

  return null;
}

export function resolveLocalWebUrl(project: {
  id?: string;
  name?: string;
  code?: string;
  healthUrl?: string | null;
  localPath?: string | null;
  ports?: Array<{ port: number; host?: string }>;
}): string | null {
  const local = lookupEntry(project);
  if (local?.localWebUrl) return local.localWebUrl;
  if (project.healthUrl) return project.healthUrl.replace(/\/api\/health\/?$/, '');
  const port = project.ports?.[0]?.port;
  if (port) return `http://127.0.0.1:${port}`;
  return null;
}

export function wrapUtf8(command: string) {
  if (/^chcp\s/i.test(command)) return command;
  return `chcp 65001 >nul & ${command}`;
}
