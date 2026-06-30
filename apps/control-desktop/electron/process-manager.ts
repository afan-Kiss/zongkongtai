import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import treeKill from 'tree-kill';
import pidusage from 'pidusage';
import { sanitizeLogChunk } from './sanitize';
import { isPortListening, resolveStartCommand } from './port-manager';
import { fileLog } from './file-logger';
import { assertRiskAllowed } from './ipc-security';

export type ProcessStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface ManagedProcess {
  projectId: string;
  projectName: string;
  command: string;
  cwd: string;
  status: ProcessStatus;
  pid?: number;
  startedAt?: string;
  exitCode?: number | null;
  error?: string;
  sessions: ProcessSession[];
}

export type SessionType = 'terminal' | 'web' | 'external-window' | 'service';

export interface ProcessSession {
  sessionId: string;
  projectId: string;
  type: SessionType;
  title: string;
  pid?: number;
  command?: string;
  cwd?: string;
  status: ProcessStatus;
  createdAt: string;
}

export interface StartCheckResult {
  ok: boolean;
  message: string;
  warnings?: string[];
  resolvedCommand?: string;
  resolvedCwd?: string;
}

const MAX_LOG_LINES = 1000;
const LOG_FLUSH_MS = 40;

type TermBackend = {
  pid: number;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number) => void) => void;
};

function buildTerminalEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FORCE_COLOR: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    LANG: 'zh_CN.UTF-8',
    LC_ALL: 'zh_CN.UTF-8',
  };
}

function loadPty(): typeof import('node-pty') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node-pty');
  } catch {
    return null;
  }
}

function createTerminal(
  shell: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): TermBackend {
  const pty = loadPty();
  if (pty) {
    const term = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd,
      env: env as Record<string, string>,
      useConpty: true,
    });
    return {
      pid: term.pid,
      write: (d) => term.write(d),
      resize: (c, r) => {
        try {
          term.resize(c, r);
        } catch {
          /* ignore */
        }
      },
      kill: () => term.kill(),
      onData: (cb) => term.onData(cb),
      onExit: (cb) => term.onExit(({ exitCode }) => cb(exitCode ?? 1)),
    };
  }

  fileLog.process('node-pty 不可用，回退到 spawn 模式', 'warn');
  const child: ChildProcessWithoutNullStreams = spawn(shell, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: 'pipe',
  });

  return {
    pid: child.pid || 0,
    write: (d) => child.stdin.write(d),
    resize: () => undefined,
    kill: () => child.kill(),
    onData: (cb) => {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (b) => cb(String(b)));
      child.stderr.on('data', (b) => cb(String(b)));
    },
    onExit: (cb) => child.on('close', (code) => cb(code ?? 1)),
  };
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess>();
  private terminals = new Map<string, TermBackend>();
  private logs = new Map<string, string[]>();
  private pendingEmit = new Map<string, string>();
  private flushTimers = new Map<string, NodeJS.Timeout>();

  getAll() {
    return [...this.processes.values()];
  }

  getRunning() {
    return this.getAll().filter((p) => p.status === 'running' || p.status === 'starting');
  }

  get(projectId: string) {
    return this.processes.get(projectId);
  }

  hasTerminal(projectId: string) {
    return this.terminals.has(projectId);
  }

  getLogs(projectId: string, tail = MAX_LOG_LINES) {
    const lines = this.logs.get(projectId) || [];
    return lines.slice(-tail).join('\n');
  }

  clearLogs(projectId: string) {
    this.logs.set(projectId, []);
    this.emit('log', { projectId, data: '\x1b[33m[日志已清空]\x1b[0m\r\n' });
  }

  private flushLog(projectId: string) {
    const chunk = this.pendingEmit.get(projectId);
    if (!chunk) return;
    this.pendingEmit.delete(projectId);
    this.flushTimers.delete(projectId);
    this.emit('log', { projectId, data: chunk });
  }

  private scheduleEmit(projectId: string, chunk: string) {
    const prev = this.pendingEmit.get(projectId) || '';
    this.pendingEmit.set(projectId, prev + chunk);
    if (!this.flushTimers.has(projectId)) {
      this.flushTimers.set(
        projectId,
        setTimeout(() => this.flushLog(projectId), LOG_FLUSH_MS),
      );
    }
  }

  private appendLog(projectId: string, chunk: string) {
    const sanitized = sanitizeLogChunk(chunk);
    const lines = this.logs.get(projectId) || [];
    for (const line of sanitized.split(/\r?\n/)) {
      if (line.length === 0) continue;
      lines.push(line);
    }
    while (lines.length > MAX_LOG_LINES) lines.shift();
    this.logs.set(projectId, lines);
    this.scheduleEmit(projectId, sanitized);
    if (sanitized.length < 400) {
      fileLog.terminal(`[${projectId}] ${sanitized.replace(/\r?\n/g, ' ').slice(0, 300)}`);
    }
  }

  async preflight(project: {
    id: string;
    name: string;
    localPath?: string | null;
    code?: string;
    desktopStartCommand?: string | null;
    startCommand?: string | null;
    devCommand?: string | null;
    commands?: Array<{ type?: string; command?: string; cwd?: string | null; enabled?: boolean }>;
    ports?: Array<{ port: number; role?: string }>;
  }): Promise<StartCheckResult> {
    const warnings: string[] = [];
    if (!project.localPath) return { ok: false, message: '该项目没有本地路径，无法启动' };
    if (!fs.existsSync(project.localPath))
      return { ok: false, message: `本地路径不存在：${project.localPath}` };

    const start = resolveStartCommand(project);
    if (!start)
      return { ok: false, message: '没有登记启动命令，请在设置或云端配置 desktop/dev/start 命令' };

    const pkg = path.join(project.localPath, 'package.json');
    if (
      !fs.existsSync(pkg) &&
      !start.command.includes('python') &&
      !/\.exe|\.bat/i.test(start.command)
    ) {
      warnings.push('未找到 package.json，请确认启动命令是否正确');
    }

    if (!fs.existsSync(start.cwd)) {
      return { ok: false, message: `工作目录不存在：${start.cwd}` };
    }

    const listenerPorts = (project.ports || [])
      .filter((p) => p.role === 'listener' || !p.role)
      .map((p) => p.port)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);

    for (const port of listenerPorts) {
      const occ = isPortListening(port);
      if (!occ) continue;
      const sameProjectRunning = this.processes.get(project.id)?.status === 'running';
      if (sameProjectRunning) {
        warnings.push(`端口 ${port} 可能已被本项目占用（PID ${occ.pid} ${occ.processName || ''}）`);
        continue;
      }
      return {
        ok: false,
        message: `端口 ${port} 已被占用：${occ.processName || '未知进程'} (PID ${occ.pid})，请先停止冲突进程`,
      };
    }

    return {
      ok: true,
      message: '检查通过，可以启动',
      warnings,
      resolvedCommand: start.command,
      resolvedCwd: start.cwd,
    };
  }

  async start(project: {
    id: string;
    name: string;
    code?: string;
    riskLevel?: string;
    localPath: string;
    desktopStartCommand?: string | null;
    startCommand?: string | null;
    devCommand?: string | null;
    commands?: Array<{ type?: string; command?: string; cwd?: string | null; enabled?: boolean }>;
    ports?: any[];
  }): Promise<ManagedProcess> {
    assertRiskAllowed(project, 'start');
    const check = await this.preflight(project);
    if (!check.ok) throw new Error(check.message);

    if (this.processes.get(project.id)?.status === 'running') {
      throw new Error('该项目已在运行中');
    }

    const start = resolveStartCommand(project)!;
    const shell = process.env.COMSPEC || 'cmd.exe';
    const managed: ManagedProcess = {
      projectId: project.id,
      projectName: project.name,
      command: start.command,
      cwd: start.cwd,
      status: 'starting',
      startedAt: new Date().toISOString(),
      sessions: [],
    };
    this.processes.set(project.id, managed);
    this.emit('status', managed);

    fileLog.process(`启动 ${project.name}: ${start.command} @ ${start.cwd}`);

    const term = createTerminal(shell, ['/d', '/c', start.command], start.cwd, buildTerminalEnv());

    this.terminals.set(project.id, term);
    managed.pid = term.pid;
    managed.status = 'running';
    const sessionId = `${project.id}-terminal-${Date.now()}`;
    managed.sessions = [
      {
        sessionId,
        projectId: project.id,
        type: 'terminal',
        title: `${project.name} 终端`,
        pid: term.pid,
        command: start.command,
        cwd: start.cwd,
        status: 'running',
        createdAt: new Date().toISOString(),
      },
    ];
    this.emit('status', managed);
    this.appendLog(project.id, `\r\n[启动] ${project.name} → ${start.command}\r\n`);

    term.onData((data) => this.appendLog(project.id, data));
    term.onExit((exitCode) => {
      managed.status = exitCode === 0 ? 'stopped' : 'error';
      managed.exitCode = exitCode;
      if (exitCode !== 0) managed.error = `进程退出，代码 ${exitCode}`;
      this.terminals.delete(project.id);
      this.emit('status', managed);
      this.appendLog(project.id, `\r\n[退出] 代码 ${exitCode}\r\n`);
      fileLog.process(`${project.name} 退出 code=${exitCode}`);
    });

    return managed;
  }

  write(projectId: string, data: string) {
    if (data === '\x03' || data.includes('\x03')) {
      fileLog.process(`Ctrl+C → ${projectId}`);
    }
    this.terminals.get(projectId)?.write(data);
  }

  resize(projectId: string, cols: number, rows: number) {
    this.terminals.get(projectId)?.resize(cols, rows);
  }

  async stop(
    projectId: string,
    project?: { code?: string; name?: string; riskLevel?: string },
  ): Promise<void> {
    if (project) assertRiskAllowed(project, 'stop');
    const managed = this.processes.get(projectId);
    const term = this.terminals.get(projectId);
    if (!term && !managed) return;

    if (managed) {
      managed.status = 'stopping';
      this.emit('status', managed);
    }

    const pid = term?.pid || managed?.pid;
    if (pid) {
      await new Promise<void>((resolve) => {
        treeKill(pid, 'SIGTERM', () => {
          setTimeout(() => treeKill(pid, 'SIGKILL', () => resolve()), 1500);
        });
      });
    }

    term?.kill();
    this.terminals.delete(projectId);
    if (managed) {
      managed.status = 'stopped';
      this.emit('status', managed);
    }
    this.appendLog(projectId, '\r\n[已停止]\r\n');
    fileLog.process(`已停止 ${managed?.projectName || projectId}`);
  }

  async stopAll(): Promise<void> {
    const running = this.getRunning();
    await Promise.all(running.map((p) => this.stop(p.projectId)));
  }

  async restart(project: Parameters<ProcessManager['start']>[0]) {
    assertRiskAllowed(project, 'restart');
    await this.stop(project.id, project);
    await new Promise((r) => setTimeout(r, 800));
    return this.start(project);
  }

  async getUsage(projectId: string) {
    const proc = this.processes.get(projectId);
    if (!proc?.pid) return null;
    try {
      const stat = await pidusage(proc.pid);
      return { cpu: stat.cpu, memory: stat.memory };
    } catch {
      return null;
    }
  }
}

export const processManager = new ProcessManager();
