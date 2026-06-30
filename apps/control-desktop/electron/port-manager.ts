import fs from 'fs';
import path from 'path';
import { runCommand } from './async-exec';
import { resolveDesktopStartCommand, resolveLocalWebUrl } from './desktop-commands';

const PRIORITY_PORTS = new Set([
  80, 443, 3000, 3001, 4723, 4725, 4730, 4790, 4788, 5173, 6780, 7788, 7789, 11434,
]);

const PORT_SCAN_TIMEOUT_MS = 3000;

export interface LocalPortInfo {
  port: number;
  pid?: number;
  processName?: string;
  protocol: string;
}

let cachedPorts: { at: number; data: LocalPortInfo[] } | null = null;
const CACHE_TTL_MS = 5000;

async function buildProcessMap(signal?: AbortSignal): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const r = await runCommand({
      cmd: 'powershell',
      args: [
        '-NoProfile',
        '-Command',
        'Get-Process | Select-Object Id,ProcessName | ConvertTo-Json',
      ],
      timeoutMs: PORT_SCAN_TIMEOUT_MS,
      signal,
      label: 'powershell Get-Process',
    });
    if (r.code !== 0) return map;
    const data = JSON.parse(r.stdout);
    const list = Array.isArray(data) ? data : [data];
    for (const p of list) {
      if (p?.Id) map.set(Number(p.Id), String(p.processName || p.ProcessName || ''));
    }
  } catch {
    /* ignore */
  }
  return map;
}

export async function scanLocalPortsAsync(
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<LocalPortInfo[]> {
  if (!forceRefresh && cachedPorts && Date.now() - cachedPorts.at < CACHE_TTL_MS) {
    return cachedPorts.data;
  }

  const procMap = await buildProcessMap(signal);
  const result: LocalPortInfo[] = [];

  try {
    const r = await runCommand({
      cmd: 'netstat',
      args: ['-ano'],
      timeoutMs: PORT_SCAN_TIMEOUT_MS,
      signal,
      label: 'netstat',
    });
    if (r.timedOut) {
      throw new Error('端口检查超时');
    }
    if (r.code !== 0) return result;

    const seen = new Set<number>();
    for (const line of r.stdout.split(/\r?\n/)) {
      const m = line.match(/(?:TCP|UDP)\s+[\d.:]+:(\d{2,5})\s+[^\s]*\s+LISTENING\s+(\d+)/i);
      if (!m) continue;
      const port = Number(m[1]);
      const pid = Number(m[2]);
      if (port < 1 || port > 65535 || seen.has(port)) continue;
      if (port < 1000 && !PRIORITY_PORTS.has(port)) continue;
      seen.add(port);
      result.push({
        port,
        pid,
        processName: procMap.get(pid),
        protocol: 'tcp',
      });
    }
  } catch (e) {
    if (e instanceof Error && /超时|timeout/i.test(e.message)) throw e;
    /* ignore */
  }

  const sorted = result.sort((a, b) => a.port - b.port);
  cachedPorts = { at: Date.now(), data: sorted };
  return sorted;
}

export async function isPortListeningAsync(
  port: number,
  signal?: AbortSignal,
  forceRefresh = false,
): Promise<LocalPortInfo | undefined> {
  const ports = await scanLocalPortsAsync(signal, forceRefresh);
  return ports.find((p) => p.port === port);
}

/** 同步兼容 — 仅返回缓存或空，不阻塞主进程 */
export function scanLocalPorts(): LocalPortInfo[] {
  return cachedPorts?.data ?? [];
}

export function isPortListening(port: number): LocalPortInfo | undefined {
  return scanLocalPorts().find((p) => p.port === port);
}

export function readPackageScripts(projectDir: string): Record<string, string> {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.scripts || {};
  } catch {
    return {};
  }
}

export function resolveStartCommand(project: {
  id?: string;
  name?: string;
  code?: string;
  desktopStartCommand?: string | null;
  startCommand?: string | null;
  devCommand?: string | null;
  localPath?: string | null;
  commands?: Array<{ type?: string; command?: string; cwd?: string | null; enabled?: boolean }>;
}): { command: string; cwd: string; type: 'desktop' | 'dev' | 'start' | 'npm' } | null {
  return resolveDesktopStartCommand(project);
}

export function inferWebUrl(project: {
  id?: string;
  name?: string;
  code?: string;
  localWebUrl?: string | null;
  localHealthUrl?: string | null;
  healthUrl?: string | null;
  localPath?: string | null;
  ports?: Array<{ port: number; host?: string }>;
}): string | null {
  if (project.localWebUrl) return project.localWebUrl;
  return resolveLocalWebUrl(project);
}

export async function checkHealthUrl(
  url: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export function invalidatePortCache() {
  cachedPorts = null;
}
