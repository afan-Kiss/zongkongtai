import { fileLog } from './file-logger';

export function wrapIpcHandler<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => Promise<R> | R,
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    const started = Date.now();
    try {
      return await fn(...args);
    } finally {
      const duration = Date.now() - started;
      const level = duration >= 3000 ? 'error' : duration >= 1000 ? 'warn' : 'info';
      const msg = `[perf] ipc=${channel} duration=${duration}ms`;
      if (level === 'error') fileLog.app(msg, 'error');
      else if (level === 'warn') fileLog.app(msg, 'warn');
      else fileLog.app(msg);
    }
  };
}
