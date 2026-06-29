import fs from 'fs';
import path from 'path';
import { MANIFEST_FILENAME, readManifestJson, type ZhuboControlManifest } from './manifest';

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
  '__pycache__',
]);

export interface ScannedManifestEntry {
  manifest: ZhuboControlManifest;
  dir: string;
  depth: number;
}

export interface ScanManifestsResult {
  manifests: ZhuboControlManifest[];
  warnings: string[];
}

function readManifestAt(dir: string): ZhuboControlManifest | null {
  const file = path.join(dir, MANIFEST_FILENAME);
  if (!fs.existsSync(file)) return null;
  try {
    return readManifestJson(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/** 递归扫描；父子目录 manifest 均保留；同 code 保留更深路径并 warning */
export function scanManifestsUnderRoot(basePath: string, maxDepth = 4): ScanManifestsResult {
  const entries: ScannedManifestEntry[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(basePath)) return { manifests: [], warnings: ['扫描根目录不存在'] };

  const walk = (dir: string, depth: number) => {
    const m = readManifestAt(dir);
    if (m) {
      entries.push({ manifest: { ...m, localPath: m.localPath || dir }, dir, depth });
    }
    if (depth >= maxDepth) return;
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of children) {
      if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  };

  for (const ent of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
    walk(path.join(basePath, ent.name), 0);
  }

  const byCode = new Map<string, ScannedManifestEntry[]>();
  for (const e of entries) {
    const list = byCode.get(e.manifest.code) || [];
    list.push(e);
    byCode.set(e.manifest.code, list);
  }

  const picked: ZhuboControlManifest[] = [];
  for (const [code, list] of byCode) {
    if (list.length > 1) {
      list.sort((a, b) => b.depth - a.depth || b.dir.length - a.dir.length);
      const keep = list[0];
      const drop = list.slice(1).map((x) => x.dir);
      warnings.push(
        `code「${code}」在 ${list.length} 处重复；保留较深路径 ${keep.dir}，忽略：${drop.join('；')}`,
      );
      picked.push(keep.manifest);
    } else {
      picked.push(list[0].manifest);
    }
  }

  const byName = new Map<string, string>();
  for (const m of picked) {
    if (byName.has(m.name) && byName.get(m.name) !== m.code) {
      warnings.push(
        `名称「${m.name}」对应多个 code（${byName.get(m.name)} / ${m.code}），请人工确认`,
      );
    }
    byName.set(m.name, m.code);
  }

  return { manifests: picked, warnings };
}
