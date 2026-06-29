import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import {
  SCAN_EXCLUDE_DIRS,
  SCAN_FILE_NAMES,
  SCAN_FILE_PATTERNS,
  PACKAGE_SCRIPT_KEYS,
  extractPortsFromText,
  AgentScanPayload,
  ScanProjectResult,
  ScanPortResult,
  ScanCommandResult,
  CommandType,
} from '@zhubo/control-shared';
import { PRIORITY_PORTS } from '@zhubo/control-shared';
import { applyManifestToScan } from './manifest-reader';

const CATEGORY_MAP: Record<string, string> = {
  主播分析: '主播分析',
  扫码枪: '扫码系统',
  记账: '记账系统',
  千帆: '千帆',
  抖店: '抖店',
  微信: '微信',
  祥钰: '工具服务',
  gemini: 'AI客服',
  客服: 'AI客服',
};

function guessCategory(dirName: string): string {
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (dirName.includes(key)) return cat;
  }
  return '工具服务';
}

function shouldScanFile(name: string): boolean {
  if (SCAN_FILE_NAMES.has(name)) return true;
  return SCAN_FILE_PATTERNS.some((p) => p.test(name));
}

function walkFiles(root: string, dir: string, files: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const ent of entries) {
    if (SCAN_EXCLUDE_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkFiles(root, full, files);
    } else if (shouldScanFile(ent.name)) {
      files.push(full);
    }
  }
  return files;
}

function sourceTypeFromFile(filePath: string): string {
  const base = path.basename(filePath);
  if (base === 'package.json') return 'package-json';
  if (base.startsWith('.env')) return 'env';
  if (base.includes('vite.config')) return 'vite';
  if (base.includes('next.config')) return 'next';
  if (base.endsWith('.bat')) return 'bat';
  if (base.endsWith('.cmd')) return 'cmd';
  if (base.endsWith('.ps1')) return 'ps1';
  if (base.includes('ecosystem')) return 'pm2';
  if (base.includes('docker-compose')) return 'docker';
  if (base.includes('nginx')) return 'nginx';
  return 'code';
}

function readPackageJson(projectDir: string): ScanCommandResult[] {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = pkg.scripts || {};
    const cmds: ScanCommandResult[] = [];
    for (const key of PACKAGE_SCRIPT_KEYS) {
      if (scripts[key]) {
        cmds.push({
          name: key,
          command: scripts[key],
          cwd: projectDir,
          type: (key === 'dev'
            ? 'dev'
            : key === 'build'
              ? 'build'
              : key === 'deploy'
                ? 'deploy'
                : key === 'test'
                  ? 'test'
                  : key === 'worker'
                    ? 'worker'
                    : 'custom') as CommandType,
        });
      }
    }
    return cmds;
  } catch {
    return [];
  }
}

function getGitRemote(projectDir: string): string | undefined {
  const configPath = path.join(projectDir, '.git', 'config');
  if (!fs.existsSync(configPath)) return undefined;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const m = content.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/i);
    return m?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function readReadmeNotes(projectDir: string): string | undefined {
  const readme = path.join(projectDir, 'README.md');
  if (!fs.existsSync(readme)) return undefined;
  try {
    const lines = fs.readFileSync(readme, 'utf8').split(/\r?\n/).slice(0, 8);
    return lines.join(' ').trim().slice(0, 200) || undefined;
  } catch {
    return undefined;
  }
}

function buildProcessNameMap(): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,Name | ConvertTo-Csv -NoTypeInformation"',
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/"(\d+)","(.+)"/);
      if (m) map.set(Number(m[1]), m[2]);
    }
  } catch {
    try {
      const out = execSync('tasklist /FO CSV /NH', {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      for (const line of out.split(/\r?\n/)) {
        const parts = line.match(/"([^"]+)","(\d+)"/);
        if (parts) map.set(Number(parts[2]), parts[1]);
      }
    } catch {
      /* ignore */
    }
  }
  return map;
}

function detectPackageManager(projectDir: string): string {
  if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectDir, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(projectDir, 'package.json'))) return 'npm';
  return 'unknown';
}

function scanProjectDir(projectDir: string, rootName: string): ScanProjectResult {
  const name = path.basename(projectDir);
  const code =
    name
      .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
      .toLowerCase()
      .slice(0, 40) || rootName;
  const files = walkFiles(projectDir, projectDir);
  const ports: ScanPortResult[] = [];
  const portSeen = new Set<string>();

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const detected = extractPortsFromText(content, file);
    for (const d of detected) {
      const dedupeKey = `${d.port}|${file}|${d.sourceLine}|${d.context.slice(0, 40)}`;
      if (portSeen.has(dedupeKey)) continue;
      portSeen.add(dedupeKey);
      ports.push({
        port: d.port,
        protocol: d.protocol,
        host: d.host,
        sourceFile: file,
        sourceLine: d.sourceLine,
        sourceType: sourceTypeFromFile(file),
        purpose: PRIORITY_PORTS.has(d.port) ? `[重点] ${d.context}` : d.context,
      });
    }
  }

  const commands = readPackageJson(projectDir);
  const pkg = commands.find((c) => c.name === 'start') || commands.find((c) => c.name === 'dev');
  const dev = commands.find((c) => c.name === 'dev');
  const build = commands.find((c) => c.name === 'build');

  let pm2Name: string | undefined;
  const ecoPath = path.join(projectDir, 'ecosystem.config.js');
  if (fs.existsSync(ecoPath)) {
    const m = fs.readFileSync(ecoPath, 'utf8').match(/name:\s*['"]([^'"]+)['"]/);
    if (m) pm2Name = m[1];
  }

  const port4723 = ports.find((p) => p.port === 4723);
  const healthUrl = port4723
    ? 'http://127.0.0.1:4723/api/health'
    : ports[0]
      ? `http://127.0.0.1:${ports[0].port}/api/health`
      : undefined;

  const gitRemote = getGitRemote(projectDir);
  const readmeNote = readReadmeNotes(projectDir);
  const notesParts = [
    gitRemote ? `Git: ${gitRemote}` : '',
    readmeNote ? `README: ${readmeNote}` : '',
  ].filter(Boolean);

  return applyManifestToScan(
    {
      name,
      code,
      localPath: projectDir,
      category: guessCategory(name),
      packageManager: detectPackageManager(projectDir),
      startCommand: pkg?.command,
      devCommand: dev?.command,
      buildCommand: build?.command,
      pm2Name,
      healthUrl,
      ports,
      commands,
      notes: notesParts.join(' | ') || undefined,
      gitRemote: gitRemote || undefined,
    },
    projectDir,
  );
}

export function getRuntimePorts(): Array<{ port: number; pid?: number; processName?: string }> {
  const result: Array<{ port: number; pid?: number; processName?: string }> = [];
  const procMap = buildProcessNameMap();
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const lines = out.split(/\r?\n/);
    const seen = new Set<number>();
    for (const line of lines) {
      const m = line.match(/(?:TCP|UDP)\s+[\d.:]+:(\d{2,5})\s+[^\s]*\s+LISTENING\s+(\d+)/i);
      if (!m) continue;
      const port = Number(m[1]);
      const pid = Number(m[2]);
      if (port < 1 || port > 65535 || seen.has(port)) continue;
      if (port < 1000 && !PRIORITY_PORTS.has(port)) continue;
      seen.add(port);
      result.push({ port, pid, processName: procMap.get(pid) });
    }
  } catch {
    /* ignore */
  }
  return result;
}

export function scanRoot(basePath: string, agentId: string): AgentScanPayload {
  const projects: ScanProjectResult[] = [];
  const entries = fs.readdirSync(basePath, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory() || SCAN_EXCLUDE_DIRS.has(ent.name)) continue;
    const full = path.join(basePath, ent.name);
    const hasPkg = fs.existsSync(path.join(full, 'package.json'));
    const hasPy =
      fs.existsSync(path.join(full, 'requirements.txt')) ||
      fs.existsSync(path.join(full, 'pyproject.toml'));
    if (!hasPkg && !hasPy) {
      const sub = fs.readdirSync(full, { withFileTypes: true }).filter((s) => s.isDirectory());
      if (sub.some((s) => fs.existsSync(path.join(full, s.name, 'package.json')))) {
        for (const s of sub) {
          if (SCAN_EXCLUDE_DIRS.has(s.name)) continue;
          const subPath = path.join(full, s.name);
          if (fs.existsSync(path.join(subPath, 'package.json'))) {
            projects.push(scanProjectDir(subPath, s.name));
          }
        }
        continue;
      }
    }
    projects.push(scanProjectDir(full, ent.name));
  }

  const runtimePorts = getRuntimePorts();
  const configuredPorts = new Set(projects.flatMap((p) => p.ports.map((x) => x.port)));
  const unknownPorts = runtimePorts.filter((r) => !configuredPorts.has(r.port));

  for (const p of projects) {
    for (const port of p.ports) {
      if (runtimePorts.some((r) => r.port === port.port)) {
        port.isRuntimeDetected = true;
      }
    }
  }

  return {
    agentId,
    scannedAt: new Date().toISOString(),
    basePath,
    projects,
    runtimePorts,
    unknownPorts,
  };
}

export function getMachineInfo() {
  return {
    machineName: os.hostname(),
    os: `${os.type()} ${os.release()}`,
  };
}
