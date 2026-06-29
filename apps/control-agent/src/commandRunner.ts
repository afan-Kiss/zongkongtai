import { spawn, ChildProcess } from 'child_process';

const running = new Map<string, ChildProcess>();

export async function runWhitelistedCommand(
  commandId: string,
  command: string,
  cwd: string,
): Promise<{ ok: boolean; message: string }> {
  if (!command || /[;&|`$]/.test(command)) {
    return { ok: false, message: '命令无效或包含不允许的字符' };
  }
  if (running.has(commandId)) {
    return { ok: false, message: '进程已在运行' };
  }
  const child = spawn('cmd.exe', ['/c', command], {
    cwd: cwd || process.cwd(),
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  });
  child.unref();
  running.set(commandId, child);
  child.on('exit', () => running.delete(commandId));
  return { ok: true, message: `已启动: ${command}` };
}

export async function stopWhitelistedCommand(commandId: string): Promise<{ ok: boolean; message: string }> {
  const child = running.get(commandId);
  if (!child?.pid) return { ok: false, message: '未找到运行中的进程' };
  try {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    running.delete(commandId);
    return { ok: true, message: '已停止' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '停止失败' };
  }
}
