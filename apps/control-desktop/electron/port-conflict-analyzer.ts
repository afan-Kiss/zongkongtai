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
import {
  DEFAULT_RISK_BY_CODE,
  normalizeRiskLevel,
  type RiskLevel,
} from '../../../packages/control-shared/src/steward';
import { loadLocalProjectsFromManifests } from './local-projects';
import { processManager, type ProcessStatus } from './process-manager';
import { scanLocalPortsAsync, invalidatePortCache } from './port-manager';
import { runCommand } from './async-exec';
import treeKill from 'tree-kill';

const CMD_TIMEOUT_MS = 3000;

const BLOCKED_PROJECT_CODES = new Set([
  'zhubo-control',
  'zhubo-analysis',
  'qianfan-relay',
  'doudian-bot',
]);

const UNSAFE_PROCESS_RE =
  /^(nginx(\.exe)?|x-ui(\.exe)?|xui|powershell(\.exe)?|pwsh(\.exe)?|chrome(\.exe)?|msedge(\.exe)?|firefox(\.exe)?|svchost(\.exe)?|system|csrss(\.exe)?|lsass(\.exe)?)$/i;

const UNSAFE_CMD_PATTERNS = [
  /nginx/i,
  /x-ui/i,
  /\bxui\b/i,
  /zhubo-analysis/i,
  /control-server/i,
  /control-web/i,
  /zhubo-control-center/i,
  /总控台/i,
];

interface ManagedPidEntry {
  projectId: string;
  projectName: string;
  projectCode?: string;
  riskLevel: RiskLevel;
  status: ProcessStatus;
  source: 'pid' | 'session';
}

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
      riskLevel: p.riskLevel,
      ports: p.ports,
      manifestDuplicatePorts: manifestDups.length ? manifestDups : undefined,
    };
  });
}

function projectRisk(code?: string, explicit?: string | null): RiskLevel {
  return normalizeRiskLevel(explicit || (code ? DEFAULT_RISK_BY_CODE[code] : undefined));
}

/** 仅 process-manager 已知 pid / session pid — 命令行匹配不算托管 */
function collectManagedPidRegistry(projects: ProjectPortInput[]): Map<number, ManagedPidEntry> {
  const map = new Map<number, ManagedPidEntry>();
  for (const proc of processManager.getAll()) {
    const proj = projects.find((p) => p.id === proc.projectId);
    const risk = projectRisk(proj?.code, proj?.riskLevel);
    const entry = {
      projectId: proc.projectId,
      projectName: proc.projectName,
      projectCode: proj?.code,
      riskLevel: risk,
      status: proc.status,
    };
    if (proc.pid) map.set(proc.pid, { ...entry, source: 'pid' });
    for (const session of proc.sessions) {
      if (session.pid) map.set(session.pid, { ...entry, source: 'session' });
    }
  }
  return map;
}

function normalizePath(p: string): string {
  return p.replace(/\//g, '\\').toLowerCase();
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

function isUnsafeSystemProcess(processName?: string, cmd = ''): boolean {
  const name = (processName || '').trim();
  if (name && UNSAFE_PROCESS_RE.test(name)) return true;
  return UNSAFE_CMD_PATTERNS.some((re) => re.test(cmd));
}

function isKillBlockedProject(code?: string, risk?: RiskLevel): boolean {
  if (!code && !risk) return false;
  if (code && BLOCKED_PROJECT_CODES.has(code)) return true;
  return risk === 'protected' || risk === 'high';
}

const SUGGESTION_UNSAFE =
  '这个端口被进程占用了，但总控不能确认它是不是旧进程。为了避免误关其他软件，暂时不提供一键关闭。你可以复制详情后再确认。';

const SUGGESTION_POSSIBLE_NOT_MANAGED =
  '看起来可能属于这个项目，但不是总控托管进程，建议手动确认。';

const SUGGESTION_STALE_MANAGED = '这是总控之前启动的旧进程，可以安全关闭。';

const SUGGESTION_CORE_BLOCKED = '这是受保护的核心服务进程，总控不会自动关闭。';

function enrichOccupationItem(
  item: PortConflictItem,
  projects: ProjectPortInput[],
  managedRegistry: Map<number, ManagedPidEntry>,
  commandLine?: string,
): PortConflictItem {
  if (item.type !== 'real_occupation' || !item.pid) return item;

  const cmd = commandLine || item.commandLine || '';
  const managed = managedRegistry.get(item.pid);

  if (isUnsafeSystemProcess(item.processName, cmd)) {
    return {
      ...item,
      commandLine: cmd || item.commandLine,
      safeToKill: false,
      suggestion: SUGGESTION_UNSAFE,
      plainText: `${item.port} 被系统或核心服务进程占用 (PID ${item.pid})，请手动确认。`,
    };
  }

  if (managed) {
    const proj = projects.find((p) => p.id === managed.projectId);
    if (isKillBlockedProject(managed.projectCode, managed.riskLevel)) {
      return {
        ...item,
        commandLine: cmd || item.commandLine,
        projects: proj
          ? [{ id: proj.id, name: proj.name, code: proj.code, localPath: proj.localPath }]
          : item.projects,
        safeToKill: false,
        suggestion: SUGGESTION_CORE_BLOCKED,
        plainText: `${item.port} 涉及受保护项目，不提供一键关闭。`,
      };
    }
    if (managed.status === 'running' || managed.status === 'starting') {
      return {
        ...item,
        commandLine: cmd || item.commandLine,
        safeToKill: false,
        suggestion: '这是总控正在运行的托管进程，不需要关闭。',
        plainText: `${item.port} 由总控托管运行中 (PID ${item.pid})。`,
      };
    }
    return {
      ...item,
      commandLine: cmd || item.commandLine,
      projects: proj
        ? [{ id: proj.id, name: proj.name, code: proj.code, localPath: proj.localPath }]
        : item.projects,
      safeToKill: true,
      killProjectId: managed.projectId,
      suggestion: SUGGESTION_STALE_MANAGED,
      plainText: `${item.port} 被总控托管的旧进程占用 (PID ${item.pid})。`,
    };
  }

  const matched = cmd ? matchProjectByCommand(cmd, projects) : undefined;
  if (matched) {
    return {
      ...item,
      commandLine: cmd,
      projects: [
        { id: matched.id, name: matched.name, code: matched.code, localPath: matched.localPath },
      ],
      safeToKill: false,
      suggestion: `看起来可能属于「${matched.name}」，${SUGGESTION_POSSIBLE_NOT_MANAGED}`,
      plainText: `${item.port} 可能属于「${matched.name}」，但不是总控托管进程。`,
    };
  }

  return {
    ...item,
    commandLine: cmd || item.commandLine,
    safeToKill: false,
    suggestion: SUGGESTION_UNSAFE,
    plainText: `${item.port} 被未知进程占用 (PID ${item.pid})，请手动确认。`,
  };
}

function isActiveManagedOccupation(pid: number, registry: Map<number, ManagedPidEntry>): boolean {
  const entry = registry.get(pid);
  return !!entry && (entry.status === 'running' || entry.status === 'starting');
}

export async function analyzePortConflictsAsync(
  ignoredIds: string[] = [],
  signal?: AbortSignal,
): Promise<PortConflictAnalysis> {
  invalidatePortCache();
  const [localPorts, projectsRaw] = await Promise.all([
    scanLocalPortsAsync(signal, true),
    Promise.resolve(loadLocalProjectsFromManifests()),
  ]);
  const cloudPorts: Parameters<typeof analyzePortConflicts>[0] = [];

  const projectInputs = buildProjectInputs(projectsRaw);
  const managedRegistry = collectManagedPidRegistry(projectInputs);

  const pre = analyzePortConflicts(cloudPorts, localPorts, projectInputs, { ignoredIds });
  const occPids = new Set<number>();
  for (const item of pre.items) {
    if (item.type === 'real_occupation' && item.pid) occPids.add(item.pid);
  }

  const cmdByPid = new Map<number, string>();
  await Promise.all(
    [...occPids].map(async (pid) => {
      cmdByPid.set(pid, await getProcessCommandLine(pid, signal));
    }),
  );

  const items = analyzePortConflicts(cloudPorts, localPorts, projectInputs, {
    ignoredIds,
    enrich: (item) =>
      enrichOccupationItem(item, projectInputs, managedRegistry, cmdByPid.get(item.pid!)),
  }).items.filter(
    (i) =>
      !(i.type === 'real_occupation' && i.pid && isActiveManagedOccupation(i.pid, managedRegistry)),
  );

  return summarizePortConflictItems(items);
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

  const cmd = item.commandLine || (await getProcessCommandLine(pid));
  if (isUnsafeSystemProcess(item.processName, cmd)) {
    return { ok: false, message: '该进程属于系统或核心服务，不能关闭。' };
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
