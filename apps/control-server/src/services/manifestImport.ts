import type { ZhuboControlManifest } from '@zhubo/control-shared';
import { manifestToScanFields } from '@zhubo/control-shared';
import { prisma } from '../lib/prisma';
import { writeOperationLog } from './operationLog';

export interface ManifestImportResult {
  imported: number;
  updated: number;
  skipped: number;
  warnings: string[];
  codes: string[];
}

/** 按 code 导入 manifest；保留已有 startCommand / deployCommand */
export async function importManifests(
  manifests: ZhuboControlManifest[],
  actor: string,
  ip?: string,
): Promise<ManifestImportResult> {
  const warnings: string[] = [];
  const codes: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const byName = new Map<string, ZhuboControlManifest>();
  for (const m of manifests) {
    if (byName.has(m.name) && byName.get(m.name)?.code !== m.code) {
      warnings.push(`名称「${m.name}」存在多个 code，请人工确认`);
    }
    byName.set(m.name, m);
  }

  for (const m of manifests) {
    if (m.control?.enabled === false) {
      skipped += 1;
      continue;
    }

    const fields = manifestToScanFields(m, m.localPath || '');
    const existing = await prisma.project.findUnique({ where: { code: m.code } });

    const data = {
      name: m.name,
      localPath: fields.localPath,
      category: m.category,
      locationType: m.locationType || existing?.locationType || 'local',
      gitRemote: m.gitRemote ?? existing?.gitRemote,
      packageManager: existing?.packageManager || 'unknown',
      startCommand: existing?.startCommand || fields.startCommand,
      devCommand: fields.devCommand ?? existing?.devCommand,
      buildCommand: fields.buildCommand ?? existing?.buildCommand,
      deployCommand: existing?.deployCommand,
      desktopStartCommand: fields.desktopStartCommand ?? existing?.desktopStartCommand,
      pm2Name: fields.pm2Name ?? existing?.pm2Name,
      healthUrl: fields.healthUrl ?? existing?.healthUrl,
      localWebUrl: fields.localWebUrl ?? existing?.localWebUrl,
      localHealthUrl: fields.localHealthUrl ?? existing?.localHealthUrl,
      publicUrl: fields.publicUrl ?? existing?.publicUrl,
      lastScannedAt: new Date(),
      notes: [existing?.notes, fields.notes].filter(Boolean).join('\n').slice(0, 2000) || undefined,
      archived: false,
    };

    const project = existing
      ? await prisma.project.update({ where: { code: m.code }, data })
      : await prisma.project.create({ data: { ...data, code: m.code } });

    if (existing) updated += 1;
    else imported += 1;
    codes.push(m.code);

    for (const port of fields.ports) {
      const hit = await prisma.portUsage.findFirst({
        where: { projectId: project.id, port: port.port, sourceType: 'manifest' },
      });
      const portData = {
        projectId: project.id,
        port: port.port,
        protocol: port.protocol,
        host: port.host,
        sourceFile: port.sourceFile,
        sourceLine: port.sourceLine,
        sourceType: 'manifest',
        purpose: port.purpose,
        role: 'listener',
        lastSeenAt: new Date(),
      };
      if (hit) {
        await prisma.portUsage.update({ where: { id: hit.id }, data: portData });
      } else {
        await prisma.portUsage.create({ data: portData });
      }
    }

    for (const cmd of fields.commands) {
      const hit = await prisma.commandProfile.findFirst({
        where: { projectId: project.id, name: cmd.name },
      });
      if (hit) {
        await prisma.commandProfile.update({
          where: { id: hit.id },
          data: { command: cmd.command, cwd: cmd.cwd, type: cmd.type },
        });
      } else {
        await prisma.commandProfile.create({
          data: {
            projectId: project.id,
            name: cmd.name,
            command: cmd.command,
            cwd: cmd.cwd,
            type: cmd.type,
          },
        });
      }
    }
  }

  await writeOperationLog({
    actor,
    action: 'manifest_import',
    targetType: 'project',
    detail: { imported, updated, skipped, codes, warnings },
    ip,
  });

  return { imported, updated, skipped, warnings, codes };
}
