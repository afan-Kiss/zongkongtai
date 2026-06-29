import { prisma } from '../lib/prisma';
import { inferPortRole, isListenerRole, isListenerSourceType, normalizeHost } from './portRole';
import { archiveStaleProjects } from './projectArchive';

const PRESERVED_SOURCE_TYPES = new Set(['manual', 'nginx']);

export interface ImportScanStats {
  projectCount: number;
  portCount: number;
  runtimeCount: number;
  unknownCount: number;
  conflictCount: number;
  warningCount: number;
  archivedProjects: string[];
}

function portKey(p: {
  projectId?: string | null;
  port: number;
  sourceFile?: string | null;
  sourceLine?: number | null;
  sourceType: string;
  protocol: string;
  host: string;
}) {
  return [
    p.projectId || '',
    p.port,
    p.sourceFile || '',
    p.sourceLine ?? '',
    p.sourceType,
    p.protocol,
    normalizeHost(p.host),
  ].join('|');
}

function runtimeKey(p: {
  agentId?: string | null;
  port: number;
  pid?: number | null;
  processName?: string | null;
  protocol: string;
  host: string;
}) {
  return [
    p.agentId || '',
    p.port,
    p.pid ?? '',
    p.processName || '',
    p.protocol,
    normalizeHost(p.host),
  ].join('|');
}

export async function recomputePortConflicts() {
  const ports = await prisma.portUsage.findMany({
    where: { runtimeStatus: { not: 'stale' } },
    include: { project: { select: { id: true, name: true, archived: true } } },
  });

  const activePorts = ports.filter((p) => !p.project?.archived);

  for (const p of activePorts) {
    const role =
      p.role ||
      inferPortRole({
        sourceType: p.sourceType,
        purpose: p.purpose,
        sourceFile: p.sourceFile,
        port: p.port,
      });
    if (p.role !== role) {
      await prisma.portUsage.update({ where: { id: p.id }, data: { role } });
      p.role = role;
    }
  }

  const byHostPort = new Map<string, typeof activePorts>();
  for (const p of activePorts) {
    const key = `${normalizeHost(p.host)}:${p.port}`;
    const list = byHostPort.get(key) || [];
    list.push(p);
    byHostPort.set(key, list);
  }

  for (const [, list] of byHostPort) {
    const listeners = list.filter((p) => {
      const role =
        p.role ||
        inferPortRole({
          sourceType: p.sourceType,
          purpose: p.purpose,
          sourceFile: p.sourceFile,
          port: p.port,
        });
      return (
        isListenerRole(role) ||
        (role === 'unknown' &&
          isListenerSourceType(p.sourceType) &&
          /PORT\s*=|port\s*:|"port"|\.listen\s*\(/i.test(p.purpose || ''))
      );
    });
    const listenerProjects = new Map<string, typeof list>();
    for (const p of listeners) {
      if (!p.projectId) continue;
      const arr = listenerProjects.get(p.projectId) || [];
      arr.push(p);
      listenerProjects.set(p.projectId, arr);
    }

    const listenerProjectIds = [...listenerProjects.keys()];

    for (const p of list) {
      let conflictLevel = 'none';
      let conflictReason: string | null = null;
      const role = p.role || 'unknown';

      if (p.sourceType === 'runtime' && !p.projectId) {
        conflictLevel = 'warning';
        conflictReason = p.processName
          ? `这是系统或第三方程序（${p.processName}）占用，暂未归属到项目`
          : '这是未知程序占用，暂未归属到项目';
      } else if (p.runtimeStatus === 'stale') {
        conflictLevel = 'warning';
        conflictReason = '上次扫描还在监听，这次没扫到，可能已停止';
      } else if (listenerProjectIds.length >= 2 && isListenerRole(role)) {
        conflictLevel = 'conflict';
        const others = listenerProjectIds
          .filter((id) => id !== p.projectId)
          .map((id) => listenerProjects.get(id)?.[0]?.project?.name || '其他项目')
          .join('、');
        conflictReason = `这个端口被「${p.project?.name || '本项目'}」和「${others}」都当成启动端口，容易撞车`;
      } else if (listenerProjectIds.length === 1 && isListenerRole(role) && listeners.length > 1) {
        conflictLevel = 'none';
        conflictReason = '这是同一个项目内部重复引用，不算冲突';
      } else if (list.filter((x) => x.projectId).length >= 2 && role === 'client_reference') {
        conflictLevel = 'warning';
        conflictReason = '这个端口只是被多个项目调用，不一定冲突';
      } else if (list.filter((x) => x.projectId).length >= 2 && role === 'unknown') {
        conflictLevel = 'warning';
        conflictReason = '多个项目都提到了这个端口，用途未完全识别，建议人工确认';
      } else if (role === 'client_reference') {
        conflictReason = '这是调用别的服务的地址，不是本项目监听端口';
      } else if (role === 'proxy') {
        conflictReason = '这是代理或 Nginx 配置引用';
      } else if (isListenerRole(role)) {
        conflictReason = '这是本项目的服务监听端口';
      }

      await prisma.portUsage.update({
        where: { id: p.id },
        data: { conflictLevel, conflictReason, role },
      });
    }
  }
}

export async function importScanResults(
  payload: import('@zhubo/control-shared').AgentScanPayload,
): Promise<ImportScanStats> {
  const scannedAt = new Date(payload.scannedAt);
  const scannedCodes = new Set(payload.projects.map((p) => p.code));
  const scannedNames = new Set(payload.projects.map((p) => p.name));
  let portCount = 0;

  for (const sp of payload.projects) {
    const existing = await prisma.project.findUnique({ where: { code: sp.code } });

    const project = await prisma.project.upsert({
      where: { code: sp.code },
      update: {
        name: sp.name,
        localPath: sp.localPath,
        category: sp.category,
        locationType: sp.locationType || existing?.locationType || 'local',
        packageManager: sp.packageManager || existing?.packageManager || 'unknown',
        startCommand: existing?.startCommand || sp.startCommand,
        devCommand: sp.devCommand ?? existing?.devCommand,
        buildCommand: sp.buildCommand ?? existing?.buildCommand,
        deployCommand: existing?.deployCommand,
        desktopStartCommand: sp.desktopStartCommand ?? existing?.desktopStartCommand,
        pm2Name: sp.pm2Name ?? existing?.pm2Name,
        healthUrl: sp.localHealthUrl || sp.healthUrl || existing?.healthUrl,
        localWebUrl: sp.localWebUrl ?? existing?.localWebUrl,
        localHealthUrl: sp.localHealthUrl ?? existing?.localHealthUrl,
        publicUrl: sp.publicUrl ?? existing?.publicUrl,
        gitRemote: sp.gitRemote ?? existing?.gitRemote,
        lastScannedAt: scannedAt,
        notes: sp.notes ?? existing?.notes,
      },
      create: {
        name: sp.name,
        code: sp.code,
        localPath: sp.localPath,
        category: sp.category,
        locationType: sp.locationType || 'local',
        packageManager: sp.packageManager || 'unknown',
        startCommand: sp.startCommand,
        devCommand: sp.devCommand,
        buildCommand: sp.buildCommand,
        desktopStartCommand: sp.desktopStartCommand,
        pm2Name: sp.pm2Name,
        healthUrl: sp.localHealthUrl || sp.healthUrl,
        localWebUrl: sp.localWebUrl,
        localHealthUrl: sp.localHealthUrl,
        publicUrl: sp.publicUrl,
        gitRemote: sp.gitRemote,
        lastScannedAt: scannedAt,
        notes: sp.notes,
        archived: false,
      },
    });

    await prisma.portUsage.deleteMany({
      where: {
        projectId: project.id,
        isRuntimeDetected: false,
        sourceType: { notIn: [...PRESERVED_SOURCE_TYPES] },
      },
    });

    const seenKeys = new Set<string>();
    for (const port of sp.ports) {
      const role = inferPortRole({
        sourceType: port.sourceType,
        purpose: port.purpose,
        sourceFile: port.sourceFile,
        port: port.port,
      });
      const data = {
        projectId: project.id,
        port: port.port,
        protocol: port.protocol,
        host: normalizeHost(port.host),
        sourceFile: port.sourceFile,
        sourceLine: port.sourceLine,
        sourceType: port.sourceType,
        purpose: port.purpose,
        isRuntimeDetected: port.isRuntimeDetected ?? false,
        role,
        agentId: payload.agentId,
        lastSeenAt: scannedAt,
        runtimeStatus: port.isRuntimeDetected ? 'active' : null,
      };
      const key = portKey(data);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const existing = await prisma.portUsage.findFirst({
        where: {
          projectId: project.id,
          port: port.port,
          sourceFile: port.sourceFile,
          sourceLine: port.sourceLine,
          sourceType: port.sourceType,
          protocol: port.protocol,
          host: normalizeHost(port.host),
        },
      });

      if (existing) {
        await prisma.portUsage.update({
          where: { id: existing.id },
          data: { ...data, updatedAt: scannedAt },
        });
      } else {
        await prisma.portUsage.create({ data });
      }
      portCount++;
    }

    for (const cmd of sp.commands) {
      const existing = await prisma.commandProfile.findFirst({
        where: { projectId: project.id, name: cmd.name, command: cmd.command },
      });
      if (!existing) {
        await prisma.commandProfile.create({
          data: {
            projectId: project.id,
            name: cmd.name,
            command: cmd.command,
            cwd: cmd.cwd,
            type: cmd.type,
            agentId: payload.agentId,
          },
        });
      }
    }
  }

  const currentRuntimeKeys = new Set<string>();
  const allRuntime = [...payload.runtimePorts, ...payload.unknownPorts];

  await prisma.portUsage.updateMany({
    where: {
      sourceType: 'runtime',
      agentId: payload.agentId,
      runtimeStatus: 'active',
    },
    data: { runtimeStatus: 'stale', isRuntimeDetected: false },
  });

  for (const rp of allRuntime) {
    const data = {
      port: rp.port,
      protocol: 'tcp',
      host: '127.0.0.1',
      sourceType: 'runtime',
      purpose: rp.processName ? `${rp.processName} (PID ${rp.pid ?? '?'})` : '运行时占用',
      isRuntimeDetected: true,
      role: 'listener',
      agentId: payload.agentId,
      pid: rp.pid,
      processName: rp.processName,
      lastSeenAt: scannedAt,
      runtimeStatus: 'active',
      projectId: null as string | null,
    };
    const key = runtimeKey(data);
    currentRuntimeKeys.add(key);

    const existing = await prisma.portUsage.findFirst({
      where: {
        sourceType: 'runtime',
        agentId: payload.agentId,
        port: rp.port,
        pid: rp.pid ?? null,
        processName: rp.processName ?? null,
      },
    });

    if (existing) {
      await prisma.portUsage.update({ where: { id: existing.id }, data });
    } else {
      await prisma.portUsage.create({ data });
    }

    const configured = await prisma.portUsage.findMany({
      where: { port: rp.port, projectId: { not: null }, sourceType: { notIn: ['runtime'] } },
    });
    for (const m of configured) {
      await prisma.portUsage.update({
        where: { id: m.id },
        data: { isRuntimeDetected: true, lastSeenAt: scannedAt },
      });
    }
  }

  await recomputePortConflicts();

  const archivedProjects = await archiveStaleProjects(scannedCodes, scannedNames);

  const conflictCount = await prisma.portUsage
    .groupBy({
      by: ['port'],
      where: { conflictLevel: 'conflict', runtimeStatus: { not: 'stale' } },
    })
    .then((rows) => rows.length);
  const warningCount = await prisma.portUsage
    .groupBy({
      by: ['port'],
      where: { conflictLevel: 'warning', runtimeStatus: { not: 'stale' } },
    })
    .then((rows) => rows.length);

  return {
    projectCount: payload.projects.length,
    portCount,
    runtimeCount: payload.runtimePorts.length,
    unknownCount: payload.unknownPorts.length,
    conflictCount,
    warningCount,
    archivedProjects,
  };
}
