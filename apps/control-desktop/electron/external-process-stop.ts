import path from 'path';
import { runCommand } from './async-exec';
import {
  detectExternalProjectStatus,
  enrichProjectForDetection,
  isQianfanRelayProject,
  type DetectableProject,
  type ExternalDetectResult,
} from './external-project-status';
import { scanLocalPortsAsync, type LocalPortInfo } from './port-manager';
import { processManager } from './process-manager';

const PROTECTED_PROJECT_CODES = new Set([
  'zhubo-control',
  'zhubo-control-center',
  'zhubo-analysis',
  'nginx',
  'x-ui',
]);

const PROTECTED_PROCESS_RE =
  /^(nginx(\.exe)?|x-ui(\.exe)?|xui|powershell(\.exe)?|pwsh(\.exe)?|chrome(\.exe)?|msedge(\.exe)?|firefox(\.exe)?|svchost(\.exe)?|system|csrss(\.exe)?|lsass(\.exe)?|珠宝本地总控工作台\.exe)$/i;

const PROTECTED_CMD_RE = [
  /nginx/i,
  /x-ui/i,
  /\bxui\b/i,
  /zhubo-analysis/i,
  /control-server/i,
  /control-web/i,
  /zhubo-control-center/i,
  /总控台/i,
  /珠宝本地总控工作台/i,
];

const QIANFAN_STOP_SOURCES = new Set([
  'qianfan-health',
  'health',
  'qianfan-port',
  'port-cmdline',
  'window',
]);

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

function isProtectedProject(project: { code?: string; id?: string }) {
  const code = String(project.code || '').toLowerCase();
  if (PROTECTED_PROJECT_CODES.has(code)) return true;
  if (code.includes('zhubo-control')) return true;
  return false;
}

function isProtectedProcess(processName: string, cmd: string): boolean {
  if (PROTECTED_PROCESS_RE.test(processName)) return true;
  return PROTECTED_CMD_RE.some((re) => re.test(cmd));
}

function commandLineMatchesProject(
  cmd: string,
  project: DetectableProject & {
    desktopStartCommand?: string | null;
    startCommand?: string | null;
    devCommand?: string | null;
  },
): boolean {
  if (!cmd) return false;
  const lower = cmd.toLowerCase();
  if (project.code && lower.includes(String(project.code).toLowerCase())) return true;
  if (project.localPath) {
    const norm = path.normalize(project.localPath).toLowerCase();
    if (lower.includes(norm) || lower.includes(norm.replace(/\\/g, '/'))) return true;
  }
  const name = String(project.name || '');
  if (name.length >= 4 && lower.includes(name.toLowerCase())) return true;

  for (const part of [project.desktopStartCommand, project.startCommand, project.devCommand]) {
    if (!part) continue;
    const token = part
      .replace(/^chcp\s+\d+\s*>\s*nul\s*&\s*/i, '')
      .trim()
      .split(/\s+/)[0];
    if (token && token.length >= 4 && lower.includes(token.toLowerCase())) return true;
  }

  if (isQianfanRelayProject(project)) {
    return /qianfan|千帆|qiqiren|wxbot|客服台/i.test(cmd);
  }
  return false;
}

function windowTitleMatches(project: DetectableProject, title?: string): boolean {
  if (!title) return false;
  const name = String(project.name || '');
  if (name.length >= 3 && title.includes(name)) return true;
  if (isQianfanRelayProject(project)) {
    return /千帆|中转|客服台|扫码|祥钰/i.test(title);
  }
  return false;
}

async function resolvePidFromPorts(
  project: DetectableProject,
  localPorts: LocalPortInfo[],
  cmdCache: Map<number, string>,
): Promise<number | undefined> {
  const ports = isQianfanRelayProject(project) ? [9323, 8787] : [];
  for (const p of project.ports || []) {
    const n = typeof p === 'number' ? p : p?.port;
    if (n) ports.push(n);
  }
  for (const port of [...new Set(ports)]) {
    const occ = localPorts.find((x) => x.port === port);
    if (!occ?.pid) continue;
    let cmd = cmdCache.get(occ.pid);
    if (cmd === undefined) {
      cmd = await getProcessCommandLine(occ.pid);
      cmdCache.set(occ.pid, cmd);
    }
    if (commandLineMatchesProject(cmd, project)) return occ.pid;
    if (
      isQianfanRelayProject(project) &&
      (port === 9323 || port === 8787) &&
      /node|electron/i.test(occ.processName || '') &&
      /qianfan|千帆|qiqiren|wxbot/i.test(cmd)
    ) {
      return occ.pid;
    }
  }
  return undefined;
}

export async function resolveExternalStopPid(
  project: DetectableProject & {
    desktopStartCommand?: string | null;
    startCommand?: string | null;
    devCommand?: string | null;
  },
  detected: ExternalDetectResult,
  localPorts?: LocalPortInfo[],
  cmdCache?: Map<number, string>,
): Promise<number | undefined> {
  if (detected.pid) return detected.pid;

  const ports = localPorts ?? (await scanLocalPortsAsync(undefined, true));
  const cache = cmdCache ?? new Map<number, string>();
  return resolvePidFromPorts(project, ports, cache);
}

export async function canStopExternalProcess(
  project: DetectableProject & {
    desktopStartCommand?: string | null;
    startCommand?: string | null;
    devCommand?: string | null;
  },
  detected: ExternalDetectResult,
): Promise<{ canStop: boolean; pid?: number; reason?: string }> {
  if (detected.status !== 'external-running') {
    return { canStop: false, reason: 'not-external' };
  }
  if (isProtectedProject(project)) {
    return { canStop: false, reason: 'protected-project' };
  }

  const source = detected.source || '';
  const qianfan = isQianfanRelayProject(project);
  const trustedSource =
    source === 'port-cmdline' ||
    source === 'qianfan-port' ||
    source === 'window' ||
    (qianfan && QIANFAN_STOP_SOURCES.has(source));

  if (!trustedSource) {
    return { canStop: false, reason: 'low-confidence' };
  }

  const pid = await resolveExternalStopPid(project, detected);
  if (!pid) {
    return { canStop: false, reason: 'no-pid' };
  }

  const cmd = await getProcessCommandLine(pid);
  const processName = path.basename(cmd.split(/\s+/)[0] || '');
  if (isProtectedProcess(processName, cmd)) {
    return { canStop: false, reason: 'protected-process' };
  }

  if (source === 'window') {
    if (!windowTitleMatches(project, detected.message)) {
      return { canStop: false, reason: 'window-mismatch' };
    }
    if (!commandLineMatchesProject(cmd, project) && !qianfan) {
      return { canStop: false, reason: 'cmdline-mismatch' };
    }
  } else if (!commandLineMatchesProject(cmd, project)) {
    if (!(qianfan && QIANFAN_STOP_SOURCES.has(source))) {
      return { canStop: false, reason: 'cmdline-mismatch' };
    }
  }

  return { canStop: true, pid };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function stopExternalProcess(opts: {
  projectId: string;
  project: DetectableProject & {
    desktopStartCommand?: string | null;
    startCommand?: string | null;
    devCommand?: string | null;
  };
  pid?: number;
  source?: string;
}): Promise<{ ok: boolean; message: string }> {
  const enriched = enrichProjectForDetection(opts.project);
  if (isProtectedProject(enriched)) {
    return { ok: false, message: '该项目受保护，不能结束' };
  }

  const fresh = await detectExternalProjectStatus(enriched);
  if (fresh.status !== 'external-running') {
    return { ok: false, message: '未检测到外部运行状态，无需结束' };
  }

  const check = await canStopExternalProcess(enriched, {
    ...fresh,
    pid: opts.pid || fresh.pid,
    source: opts.source || fresh.source,
  });

  if (!check.canStop || !check.pid) {
    return { ok: false, message: '无法确认进程归属，未执行结束' };
  }

  const cmd = await getProcessCommandLine(check.pid);
  const processName = path.basename(cmd.split(/\s+/)[0] || '');
  if (isProtectedProcess(processName, cmd)) {
    return { ok: false, message: '目标进程受保护，未执行结束' };
  }

  try {
    await runCommand({
      cmd: 'taskkill',
      args: ['/PID', String(check.pid), '/T', '/F'],
      timeoutMs: 8000,
      label: 'taskkill external',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `结束进程失败：${msg.slice(0, 120)}` };
  }

  await sleep(1500);
  return { ok: true, message: '已结束外部进程' };
}
