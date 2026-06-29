import fs from 'fs';
import path from 'path';
import {
  MANIFEST_FILENAME,
  readManifestJson,
  manifestToScanFields,
  type ZhuboControlManifest,
} from '@zhubo/control-shared';

export function readProjectManifest(projectDir: string): ZhuboControlManifest | null {
  const file = path.join(projectDir, MANIFEST_FILENAME);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return readManifestJson(raw);
  } catch {
    return null;
  }
}

export function applyManifestToScan(
  scan: import('@zhubo/control-shared').ScanProjectResult,
  projectDir: string,
): import('@zhubo/control-shared').ScanProjectResult {
  const manifest = readProjectManifest(projectDir);
  if (!manifest) return scan;

  const fields = manifestToScanFields(manifest, projectDir);
  const portKeys = new Set(scan.ports.map((p) => p.port));
  const mergedPorts = [...scan.ports];
  for (const p of fields.ports) {
    if (!portKeys.has(p.port)) mergedPorts.push(p);
  }

  return {
    ...scan,
    name: manifest.name || scan.name,
    code: manifest.code || scan.code,
    category: manifest.category || scan.category,
    locationType: manifest.locationType || scan.locationType,
    localPath: fields.localPath,
    startCommand: fields.startCommand || scan.startCommand,
    devCommand: fields.devCommand || scan.devCommand,
    buildCommand: fields.buildCommand || scan.buildCommand,
    desktopStartCommand: fields.desktopStartCommand,
    pm2Name: fields.pm2Name || scan.pm2Name,
    healthUrl: fields.healthUrl || scan.healthUrl,
    localWebUrl: fields.localWebUrl,
    localHealthUrl: fields.localHealthUrl,
    publicUrl: fields.publicUrl,
    gitRemote: manifest.gitRemote || scan.gitRemote,
    ports: mergedPorts,
    commands: fields.commands.length ? [...scan.commands, ...fields.commands] : scan.commands,
    notes: [scan.notes, fields.notes, manifest.gitRemote ? `Git: ${manifest.gitRemote}` : '']
      .filter(Boolean)
      .join('\n'),
  };
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
      if (!ent.isDirectory()) continue;
      if (['node_modules', '.git', 'dist', 'build'].includes(ent.name)) continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  };

  for (const ent of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (['node_modules', '.git'].includes(ent.name)) continue;
    walk(path.join(basePath, ent.name), 0);
  }
  return out;
}
