import type { ZhuboControlManifest } from '@zhubo/control-shared';
import { manifestToScanFields, validateManifest } from '@zhubo/control-shared';
import { prisma, withDbRetry } from '../lib/prisma';
import { writeOperationLog } from './operationLog';

export interface ManifestImportResult {
  imported: number;
  updated: number;
  skipped: number;
  warnings: string[];
  codes: string[];
}

const MANIFEST_ENV = JSON.stringify({ source: 'manifest' });

/** 按 code 导入 manifest；保留已有 startCommand / deployCommand */
export async function importManifests(
  manifests: ZhuboControlManifest[],
  actor: string,
  ip?: string,
  scanWarnings: string[] = [],
): Promise<ManifestImportResult> {
  const warnings = [...scanWarnings];
  const codes: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of manifests) {
    const validation = validateManifest(m);
    warnings.push(...validation.warnings);
    if (!validation.ok) {
      warnings.push(...validation.errors.map((e) => `[${m.code || m.name}] ${e}`));
      skipped += 1;
      continue;
    }

    if (m.control?.enabled === false) {
      skipped += 1;
      continue;
    }

    const fields = manifestToScanFields(m, m.localPath || '');
    const existing = await withDbRetry(() =>
      prisma.project.findUnique({ where: { code: m.code } }),
    );

    const data = {
      name: m.name,
      localPath: fields.localPath,
      category: m.category,
      locationType: m.locationType || existing?.locationType || 'local',
      gitRemote: m.gitRemote ?? existing?.gitRemote,
      serverPath: fields.serverPath ?? existing?.serverPath,
      branch: fields.branch ?? existing?.branch,
      owner: fields.owner ?? existing?.owner,
      status: fields.status ?? existing?.status ?? 'unknown',
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
      internalUrl: fields.internalUrl ?? existing?.internalUrl,
      lastScannedAt: new Date(),
      notes: [existing?.notes, fields.notes].filter(Boolean).join('\n').slice(0, 2000) || undefined,
      archived: false,
    };

    const project = await withDbRetry(() =>
      existing
        ? prisma.project.update({ where: { code: m.code }, data })
        : prisma.project.create({ data: { ...data, code: m.code } }),
    );

    if (existing) updated += 1;
    else imported += 1;
    codes.push(m.code);

    const manifestPortNums = new Set(fields.ports.map((p) => p.port));

    for (const port of fields.ports) {
      await withDbRetry(async () => {
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
          runtimeStatus: null as string | null,
          lastSeenAt: new Date(),
        };
        if (hit) {
          await prisma.portUsage.update({ where: { id: hit.id }, data: portData });
        } else {
          await prisma.portUsage.create({ data: portData });
        }
      });
    }

    await withDbRetry(async () => {
      const stalePorts = await prisma.portUsage.findMany({
        where: { projectId: project.id, sourceType: 'manifest' },
      });
      for (const old of stalePorts) {
        if (!manifestPortNums.has(old.port)) {
          await prisma.portUsage.update({
            where: { id: old.id },
            data: { runtimeStatus: 'stale', lastSeenAt: new Date() },
          });
        }
      }
    });

    const manifestCmdNames = new Set(fields.commands.map((c) => c.name));

    for (const cmd of fields.commands) {
      await withDbRetry(async () => {
        const hit = await prisma.commandProfile.findFirst({
          where: { projectId: project.id, name: cmd.name },
        });
        if (hit) {
          await prisma.commandProfile.update({
            where: { id: hit.id },
            data: {
              command: cmd.command,
              cwd: cmd.cwd,
              type: cmd.type,
              envJson: MANIFEST_ENV,
              enabled: true,
            },
          });
        } else {
          await prisma.commandProfile.create({
            data: {
              projectId: project.id,
              name: cmd.name,
              command: cmd.command,
              cwd: cmd.cwd,
              type: cmd.type,
              envJson: MANIFEST_ENV,
              enabled: true,
            },
          });
        }
      });
    }

    await withDbRetry(async () => {
      const oldCmds = await prisma.commandProfile.findMany({
        where: { projectId: project.id, envJson: MANIFEST_ENV },
      });
      for (const old of oldCmds) {
        if (!manifestCmdNames.has(old.name)) {
          await prisma.commandProfile.update({
            where: { id: old.id },
            data: {
              enabled: false,
              envJson: JSON.stringify({ source: 'manifest', stale: true }),
            },
          });
        }
      }
    });
  }

  try {
    await writeOperationLog({
      actor,
      action: 'manifest_import',
      targetType: 'project',
      detail: { imported, updated, skipped, codes, warnings },
      ip,
    });
  } catch (e) {
    warnings.push(`操作日志写入失败（导入仍成功）：${e instanceof Error ? e.message : String(e)}`);
  }

  return { imported, updated, skipped, warnings, codes };
}
