import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  readManifestJson,
  type ZhuboControlManifest,
} from '../../../packages/control-shared/src/manifest';

const MANIFEST_FILENAME = 'zhubo-control.manifest.json';
import { loadConfig } from './config';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'logs',
  'tmp',
  'cache',
  '.turbo',
  'vendor',
  'dist-desktop',
  'win-unpacked',
]);

export function readProjectManifest(projectDir: string): ZhuboControlManifest | null {
  const file = path.join(projectDir, MANIFEST_FILENAME);
  if (!fs.existsSync(file)) return null;
  try {
    return readManifestJson(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

export function scanManifestsUnderRoot(basePath: string): ZhuboControlManifest[] {
  const out: ZhuboControlManifest[] = [];
  if (!fs.existsSync(basePath)) return out;

  const walk = (dir: string, depth: number) => {
    const m = readProjectManifest(dir);
    if (m) {
      out.push({ ...m, localPath: m.localPath || dir });
      return;
    }
    if (depth > 2) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  };

  for (const ent of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
    walk(path.join(basePath, ent.name), 0);
  }
  return out;
}

export function getScanRoot() {
  return loadConfig().scanRoot || 'E:\\我的软件源码';
}

export function enrichProjectsWithManifests<T extends { code?: string; localPath?: string | null }>(
  projects: T[],
  basePath?: string,
): Array<T & { manifestFavorite?: boolean; manifestGroup?: string }> {
  const root = basePath || getScanRoot();
  const byCode = new Map<string, ZhuboControlManifest>();
  for (const m of scanManifestsUnderRoot(root)) {
    byCode.set(m.code, m);
  }
  return projects.map((p) => {
    const fromPath = p.localPath ? readProjectManifest(p.localPath) : null;
    const m = fromPath || (p.code ? byCode.get(p.code) : null);
    return {
      ...p,
      manifestFavorite: m?.control?.favorite,
      manifestGroup: m?.control?.group,
    };
  });
}

export function runAgentScanCli(monorepoRoot: string): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const agentDir = path.join(monorepoRoot, 'apps', 'control-agent');
    if (!fs.existsSync(path.join(agentDir, 'package.json'))) {
      resolve({ ok: false, message: '找不到 control-agent，无法执行 E 盘扫描' });
      return;
    }
    const child = spawn('npm', ['run', 'scan'], {
      cwd: agentDir,
      env: { ...process.env, SCAN_ROOT: getScanRoot() },
      windowsHide: true,
      shell: true,
    });
    let out = '';
    child.stdout?.on('data', (b) => {
      out += String(b);
    });
    child.stderr?.on('data', (b) => {
      out += String(b);
    });
    child.on('exit', (code) => {
      if (code === 0) resolve({ ok: true, message: out.trim() || 'E 盘扫描完成并已上传总控' });
      else resolve({ ok: false, message: out.trim() || `扫描失败，退出码 ${code}` });
    });
  });
}
