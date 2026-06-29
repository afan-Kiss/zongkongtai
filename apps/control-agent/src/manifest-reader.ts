import fs from 'fs';
import path from 'path';
import {
  MANIFEST_FILENAME,
  readManifestJson,
  manifestToScanFields,
  scanManifestsUnderRoot,
  asArray,
  normalizeScanFields,
  type ZhuboControlManifest,
} from '@zhubo/control-shared';

export { scanManifestsUnderRoot };

export function readProjectManifest(projectDir: string): ZhuboControlManifest | null {
  const file = path.join(projectDir, MANIFEST_FILENAME);
  if (!fs.existsSync(file)) return null;
  try {
    return readManifestJson(JSON.parse(fs.readFileSync(file, 'utf8')));
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

  const fields = normalizeScanFields(manifestToScanFields(manifest, projectDir));
  const portKeys = new Set(asArray(scan.ports).map((p) => p.port));
  const mergedPorts = [...asArray(scan.ports)];
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
    internalUrl: fields.internalUrl,
    serverPath: fields.serverPath,
    branch: fields.branch,
    owner: fields.owner,
    status: fields.status,
    gitRemote: manifest.gitRemote || scan.gitRemote,
    ports: mergedPorts,
    commands: fields.commands.length
      ? [...asArray(scan.commands), ...fields.commands]
      : asArray(scan.commands),
    notes: [scan.notes, fields.notes, manifest.gitRemote ? `Git: ${manifest.gitRemote}` : '']
      .filter(Boolean)
      .join('\n'),
  };
}
