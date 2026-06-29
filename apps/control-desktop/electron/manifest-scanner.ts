import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  MANIFEST_FILENAME,
  readManifestJson,
  type ZhuboControlManifest,
} from '../../../packages/control-shared/src/manifest';
import { scanManifestsUnderRoot } from '../../../packages/control-shared/src/manifestFsScan';
import { loadConfig } from './config';

export function readProjectManifest(projectDir: string): ZhuboControlManifest | null {
  const file = path.join(projectDir, MANIFEST_FILENAME);
  if (!fs.existsSync(file)) return null;
  try {
    return readManifestJson(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

export function scanManifestsLocal(basePath?: string) {
  const root = basePath || loadConfig().scanRoot || 'E:\\我的软件源码';
  return scanManifestsUnderRoot(root);
}

export function getScanRoot() {
  return loadConfig().scanRoot || 'E:\\我的软件源码';
}

export function enrichProjectsWithManifests<T extends { code?: string; localPath?: string | null }>(
  projects: T[],
  basePath?: string,
): Array<T & { manifestFavorite?: boolean; manifestGroup?: string }> {
  const { manifests } = scanManifestsLocal(basePath);
  const byCode = new Map<string, ZhuboControlManifest>();
  for (const m of manifests) byCode.set(m.code, m);

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
    child.stdout?.on('data', (b: Buffer) => {
      out += String(b);
    });
    child.stderr?.on('data', (b: Buffer) => {
      out += String(b);
    });
    child.on('exit', (code: number | null) => {
      if (code === 0) resolve({ ok: true, message: out.trim() || 'E 盘扫描完成并已上传总控' });
      else resolve({ ok: false, message: out.trim() || `扫描失败，退出码 ${code}` });
    });
  });
}
