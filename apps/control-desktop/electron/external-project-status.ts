import path from 'path';
import { runCommand } from './async-exec';
import { checkHealthUrl, scanLocalPortsAsync, type LocalPortInfo } from './port-manager';
import { listWindows, type WindowInfo } from './native-helper-client';
import { processManager } from './process-manager';

export type ProjectDetectStatus = 'idle' | 'running' | 'external-running';

export interface ExternalDetectResult {
  status: ProjectDetectStatus;
  source?: string;
  pid?: number;
  message?: string;
}

export interface DetectableProject {
  id: string;
  name: string;
  code?: string;
  localPath?: string | null;
  healthUrl?: string | null;
  localHealthUrl?: string | null;
  ports?: Array<number | { port: number; role?: string }>;
}

export interface ExternalRunningRow {
  projectId: string;
  projectName: string;
  status: ProjectDetectStatus;
  source?: string;
  pid?: number;
  message?: string;
}

const QIANFAN_HEALTH_URLS = [
  'http://127.0.0.1:9323/api/health',
  'http://127.0.0.1:8787/api/health',
];

const QIANFAN_WINDOW_TITLES = ['千帆客服台机器人', '千帆中转机器人', '中转运行中'];

const DETECT_TIMEOUT_MS = 4000;
const CMD_TIMEOUT_MS = 3000;

async function getProcessCommandLine(pid: number): Promise<string> {
  try {
    const r = await runCommand({
      cmd: 'powershell',
      args: [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ],
      timeoutMs: CMD_TIMEOUT_MS,
      label: 'powershell CommandLine',
    });
    return r.stdout.trim();
  } catch {
    return '';
  }
}

export function isQianfanRelayProject(project: { code?: string; name?: string }) {
  const code = String(project.code || '').toLowerCase();
  const name = String(project.name || '');
  if (code.includes('qianfan') || code === 'qianfan-relay') return true;
  return /千帆|中转机器人|客服台机器人/.test(name);
}

/** 千帆 manifest 运行时补全：9323 为本地 API，9322 仅为客服台 DevTools */
export function enrichProjectForDetection<T extends DetectableProject>(project: T): T {
  if (!isQianfanRelayProject(project)) return project;
  const ports = [...(project.ports || [])];
  const nums = new Set(ports.map((p) => (typeof p === 'number' ? p : p.port)));
  if (!nums.has(9323)) {
    ports.push({ port: 9323, role: 'localApi' });
  }
  return {
    ...project,
    ports,
    localHealthUrl: project.localHealthUrl || 'http://127.0.0.1:9323/api/health',
  };
}

function collectPorts(project: DetectableProject): number[] {
  const out: number[] = [];
  for (const p of project.ports || []) {
    const n = typeof p === 'number' ? p : p?.port;
    if (n && n > 0) out.push(n);
  }
  return [...new Set(out)];
}

function commandLineMatchesProject(cmd: string, project: DetectableProject): boolean {
  if (!cmd) return false;
  const lower = cmd.toLowerCase();
  if (project.code && lower.includes(String(project.code).toLowerCase())) return true;
  if (project.localPath) {
    const norm = path.normalize(project.localPath).toLowerCase();
    if (lower.includes(norm) || lower.includes(norm.replace(/\\/g, '/'))) return true;
  }
  const name = String(project.name || '');
  if (name.length >= 4 && lower.includes(name.toLowerCase())) return true;
  if (isQianfanRelayProject(project)) {
    return /qianfan|千帆|four-in-one|qiqiren|wxbot|客服台/i.test(cmd);
  }
  return false;
}

async function checkHealthUrls(project: DetectableProject): Promise<ExternalDetectResult | null> {
  const urls = [
    project.localHealthUrl,
    project.healthUrl,
    ...(isQianfanRelayProject(project) ? QIANFAN_HEALTH_URLS : []),
  ].filter((u) => u && /^https?:\/\//i.test(u)) as string[];
  for (const url of [...new Set(urls)]) {
    const res = await checkHealthUrl(url, DETECT_TIMEOUT_MS);
    if (res.ok) {
      return {
        status: 'external-running',
        source: url.includes('9323') ? 'qianfan-health' : 'health',
        message: url,
      };
    }
  }
  return null;
}

async function checkPortsWithCmd(
  project: DetectableProject,
  localPorts: LocalPortInfo[],
  cmdCache: Map<number, string>,
): Promise<ExternalDetectResult | null> {
  for (const port of collectPorts(project)) {
    const occ = localPorts.find((p) => p.port === port);
    if (!occ?.pid) continue;

    let cmd = cmdCache.get(occ.pid);
    if (cmd === undefined) {
      cmd = await getProcessCommandLine(occ.pid);
      cmdCache.set(occ.pid, cmd);
    }

    if (isQianfanRelayProject(project) && port === 9322) {
      if (!commandLineMatchesProject(cmd, project)) continue;
    }

    if (commandLineMatchesProject(cmd, project)) {
      return { status: 'external-running', source: 'port-cmdline', pid: occ.pid };
    }

    if (isQianfanRelayProject(project) && (port === 9323 || port === 8787)) {
      if (/node|electron/i.test(occ.processName || '') && /qianfan|千帆|qiqiren/i.test(cmd)) {
        return { status: 'external-running', source: 'qianfan-port', pid: occ.pid };
      }
    }
  }
  return null;
}

async function checkQianfanWindows(
  project: DetectableProject,
  windowsCache?: WindowInfo[],
): Promise<ExternalDetectResult | null> {
  if (!isQianfanRelayProject(project)) return null;
  const windows = windowsCache ?? (await listWindows().catch(() => []));
  const hit = windows.find((w) => QIANFAN_WINDOW_TITLES.some((t) => w.title.includes(t)));
  if (hit) {
    return {
      status: 'external-running',
      source: 'window',
      pid: hit.pid,
      message: hit.title,
    };
  }
  return null;
}

export async function detectExternalProjectStatus(
  project: DetectableProject,
  opts?: {
    localPorts?: LocalPortInfo[];
    cmdCache?: Map<number, string>;
    windowsCache?: WindowInfo[];
  },
): Promise<ExternalDetectResult> {
  const p = enrichProjectForDetection(project);
  const managed = processManager.get(p.id);
  if (managed?.status === 'running' || managed?.status === 'starting') {
    return { status: 'running', source: 'managed', pid: managed.pid };
  }

  const health = await checkHealthUrls(p);
  if (health) return health;

  const localPorts = opts?.localPorts ?? (await scanLocalPortsAsync(undefined, true));
  const cmdCache = opts?.cmdCache ?? new Map<number, string>();
  const portHit = await checkPortsWithCmd(p, localPorts, cmdCache);
  if (portHit) return portHit;

  if (isQianfanRelayProject(p)) {
    const winHit = await checkQianfanWindows(p, opts?.windowsCache);
    if (winHit) return winHit;
  }

  return { status: 'idle' };
}

export async function detectAllExternalRunning(
  projects: DetectableProject[],
): Promise<ExternalRunningRow[]> {
  const localPorts = await scanLocalPortsAsync(undefined, true);
  const cmdCache = new Map<number, string>();
  const enriched = projects.map(enrichProjectForDetection);
  const needsWindows = enriched.some(isQianfanRelayProject);
  const windowsCache = needsWindows ? await listWindows().catch(() => []) : undefined;

  const rows: ExternalRunningRow[] = [];
  for (const p of enriched) {
    const detected = await detectExternalProjectStatus(p, {
      localPorts,
      cmdCache,
      windowsCache,
    });
    rows.push({
      projectId: p.id,
      projectName: p.name,
      ...detected,
    });
  }
  return rows;
}
