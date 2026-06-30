import fs from 'fs';
import path from 'path';
import {
  analyzePortConflicts,
  formatPortConflictCopy,
  summarizePortConflictItems,
  type PortConflictAnalysis,
  type PortConflictItem,
  type ProjectPortInput,
} from '../../../packages/control-shared/src/portConflict';
import { MANIFEST_FILENAME } from '../../../packages/control-shared/src/manifest';
import { cloudClient } from './cloud-client';
import { processManager } from './process-manager';
import { scanLocalPortsAsync, invalidatePortCache } from './port-manager';
import { runCommand } from './async-exec';
import { readProjectManifest } from './manifest-scanner';
import treeKill from 'tree-kill';

const CMD_TIMEOUT_MS = 3000;

async function getProcessCommandLine(pid: number, signal?: AbortSignal): Promise<string> {
  try {
    const r = await runCommand({
      cmd: 'powershell',
      args: [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ],
      timeoutMs: CMD_TIMEOUT_MS,
      signal,
      label: 'powershell CommandLine',
    });
    return r.stdout.trim();
  } catch {
    return '';
  }
}

function normalizePath(p: string): string {
  return p.replace(/\//g, '\\').toLowerCase();
}

function detectManifestDuplicatePorts(manifestPath: string): number[] {
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const ports: number[] = Array.isArray(raw.ports)
      ? raw.ports.map((p: unknown) => Number(p)).filter((p: number) => p > 0)
      : [];
    const seen = new Set<number>();
    const dups = new Set<number>();
    for (const port of ports) {
      if (seen.has(port)) dups.add(port);
      seen.add(port);
    }
    return [...dups];
  } catch {
    return [];
  }
}

function buildProjectInputs(projects: any[]): ProjectPortInput[] {
  return projects.map((p) => {
    const manifestDups =
      p.localPath && fs.existsSync(p.localPath)
        ? detectManifestDuplicatePorts(path.join(p.localPath, MANIFEST_FILENAME))
        : [];
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      localPath: p.localPath,
      ports: p.ports,
      manifestDuplicatePorts: manifestDups.length ? manifestDups : undefined,
    };
  });
}

function matchProjectByCommand(
  cmd: string,
  projects: ProjectPortInput[],
): ProjectPortInput | undefined {
  const lower = cmd.toLowerCase();
  for (const p of projects) {
    if (!p.localPath) continue;
    const norm = normalizePath(p.localPath);
    if (norm.length > 4 && lower.includes(norm)) return p;
    if (p.code && lower.includes(p.code.toLowerCase())) return p;
  }
  return undefined;
}

function enrichOccupationItem(
  item: PortConflictItem,
  projects: ProjectPortInput[],
  managedPids: Map<number, string>,
  commandLine?: string,
): PortConflictItem {
  if (item.type !== 'real_occupation' || !item.pid) return item;

  const cmd = commandLine || item.commandLine || '';
  const managedProjectId = item.pid ? managedPids.get(item.pid) : undefined;

  if (managedProjectId) {
    const proj = projects.find((p) => p.id === managedProjectId);
    if (proj) {
      return {
        ...item,
        commandLine: cmd || item.commandLine,
        projects: [{ id: proj.id, name: proj.name, code: proj.code, localPath: proj.localPath }],
        safeToKill: true,
        killProjectId: proj.id,
        suggestion: `${item.port} 当前被 ${item.processName || '进程'} 占用。如果这是「${proj.name}」旧进程，可以关闭后重试。`,
        plainText: `${item.port} 当前被 ${item.processName || '进程'} (PID ${item.pid}) 占用。`,
      };
    }
  }

  const matched = cmd ? matchProjectByCommand(cmd, projects) : undefined;
  if (matched) {
    return {
      ...item,
      commandLine: cmd,
      projects: [
        { id: matched.id, name: matched.name, code: matched.code, localPath: matched.localPath },
      ],
      safeToKill: true,
      killProjectId: matched.id,
      suggestion: `${item.port} 当前被 ${item.processName || '进程'} 占用。如果这是「${matched.name}」旧进程，可以关闭后重试。`,
      plainText: `${item.port} 当前被 ${item.processName || '进程'} (PID ${item.pid}) 占用。`,
    };
  }

  return {
    ...item,
    commandLine: cmd || item.commandLine,
    safeToKill: false,
    suggestion: `这个端口被${item.processName ? ` ${item.processName}` : '未知进程'}占用，不能自动关闭，避免误杀其他软件。`,
    plainText: `${item.port} 被未知进程占用 (PID ${item.pid})，请手动确认。`,
  };
}

export async function analyzePortConflictsAsync(
  ignoredIds: string[] = [],
  signal?: AbortSignal,
): Promise<PortConflictAnalysis> {
  invalidatePortCache();
  const [cloudPorts, localPorts, projects] = await Promise.all([
    cloudClient.ports().catch(() => []),
    scanLocalPortsAsync(signal, true),
    cloudClient.projects().catch(() => []),
  ]);

  const projectInputs = buildProjectInputs(projects);
  const managedPids = new Map<number, string>();
  for (const proc of processManager.getAll()) {
    if (proc.pid && proc.status === 'running') managedPids.set(proc.pid, proc.projectId);
  }

  const occPids = new Set<number>();
  const pre = analyzePortConflicts(cloudPorts, localPorts, projectInputs, { ignoredIds });
  for (const item of pre.items) {
    if (item.type === 'real_occupation' && item.pid) occPids.add(item.pid);
  }

  const cmdByPid = new Map<number, string>();
  await Promise.all(
    [...occPids].map(async (pid) => {
      cmdByPid.set(pid, await getProcessCommandLine(pid, signal));
    }),
  );

  return summarizePortConflictItems(
    analyzePortConflicts(cloudPorts, localPorts, projectInputs, {
      ignoredIds,
      enrich: (item) => {
        if (item.type !== 'real_occupation' || !item.pid) return item;
        if (managedPids.has(item.pid)) {
          return { ...item, safeToKill: false };
        }
        return enrichOccupationItem(item, projectInputs, managedPids, cmdByPid.get(item.pid));
      },
    }).items.filter((i) => !(i.type === 'real_occupation' && i.pid && managedPids.has(i.pid))),
  );
}

export async function safeKillPortProcess(
  pid: number,
  projectId: string,
  port: number,
  ignoredIds: string[] = [],
): Promise<{ ok: boolean; message: string }> {
  const analysis = await analyzePortConflictsAsync(ignoredIds);
  const item = analysis.items.find(
    (i) => i.type === 'real_occupation' && i.pid === pid && i.port === port,
  );
  if (!item?.safeToKill || item.killProjectId !== projectId) {
    return { ok: false, message: '该进程无法安全关闭，请手动确认后再操作。' };
  }

  return new Promise((resolve) => {
    treeKill(pid, 'SIGTERM', () => {
      setTimeout(() => {
        treeKill(pid, 'SIGKILL', () => {
          invalidatePortCache();
          resolve({ ok: true, message: '已关闭旧进程，请重新检测。' });
        });
      }, 1200);
    });
  });
}

export function previewManifestPortDedupe(localPath: string): {
  ok: boolean;
  message: string;
  before?: number[];
  after?: number[];
  diffText?: string;
} {
  const file = path.join(localPath, MANIFEST_FILENAME);
  if (!fs.existsSync(file)) return { ok: false, message: '找不到 manifest 文件' };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const before: number[] = Array.isArray(raw.ports)
      ? raw.ports.map((p: unknown) => Number(p)).filter((p: number) => p > 0)
      : [];
    const after = [...new Set(before)];
    if (before.length === after.length) {
      return { ok: false, message: '没有发现重复端口，无需清理' };
    }
    const diffText = `ports: [${before.join(', ')}] → [${after.join(', ')}]`;
    return { ok: true, message: '预览完成', before, after, diffText };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export function applyManifestPortDedupe(localPath: string): {
  ok: boolean;
  message: string;
  diffText?: string;
} {
  const preview = previewManifestPortDedupe(localPath);
  if (!preview.ok || !preview.before || !preview.after) return preview;
  const file = path.join(localPath, MANIFEST_FILENAME);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    raw.ports = preview.after;
    fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    return {
      ok: true,
      message: '已清理重复端口，请确认后上传 Git。',
      diffText: preview.diffText,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export { formatPortConflictCopy };
