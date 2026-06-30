import { spawn } from 'child_process';
import { fileLog } from './file-logger';

export interface RunCommandOpts {
  cmd: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  label?: string;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
}

const MAX_OUTPUT_CHARS = 1024 * 1024;
const MAX_ERROR_CHARS = 500;

function appendCapped(current: string, chunk: string, label: string): string {
  if (current.length >= MAX_OUTPUT_CHARS) return current;
  const next = current + chunk;
  if (next.length <= MAX_OUTPUT_CHARS) return next;
  if (current.length < MAX_OUTPUT_CHARS) {
    fileLog.app(`[exec] 命令输出过长，已截断 ${label}`, 'warn');
  }
  return next.slice(0, MAX_OUTPUT_CHARS);
}

export function runCommand(opts: RunCommandOpts): Promise<RunCommandResult> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const label = opts.label || `${opts.cmd} ${opts.args.join(' ')}`.slice(0, 80);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(opts.cmd, opts.args, {
      cwd: opts.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code, timedOut });
    };

    const onAbort = () => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish(1);
      }, 300);
    };

    opts.signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      fileLog.app(`[exec] timeout ${label} ${timeoutMs}ms`, 'warn');
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish(1);
      }, 300);
    }, timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      stdout = appendCapped(stdout, d, label);
    });
    child.stderr?.on('data', (d: string) => {
      stderr = appendCapped(stderr, d, label);
    });
    child.on('error', (e) => {
      stderr = appendCapped(stderr, e.message, label);
      finish(1);
    });
    child.on('close', (code) => finish(code ?? 1));
  });
}

export async function runGit(
  cwd: string,
  args: string[],
  opts?: { timeoutMs?: number; signal?: AbortSignal; label?: string },
): Promise<string> {
  const r = await runCommand({
    cmd: 'git',
    args,
    cwd,
    timeoutMs: opts?.timeoutMs ?? 3000,
    signal: opts?.signal,
    label: opts?.label || `git ${args[0]}`,
  });
  if (r.timedOut) throw new Error('Git 命令超时');
  if (r.code !== 0)
    throw new Error((r.stderr || r.stdout || 'git failed').slice(0, MAX_ERROR_CHARS));
  return r.stdout;
}
