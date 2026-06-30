import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { fileLog } from './file-logger';

export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

export interface TaskRecord {
  id: string;
  type: string;
  title: string;
  status: TaskStatus;
  progress: number;
  message: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  result?: unknown;
}

export interface TaskProgressUpdate {
  progress?: number;
  message?: string;
  partial?: unknown;
}

export type TaskRunner = (ctx: {
  signal: AbortSignal;
  progress: (update: TaskProgressUpdate) => void;
}) => Promise<unknown>;

class TaskManager extends EventEmitter {
  private tasks = new Map<string, TaskRecord>();
  private controllers = new Map<string, AbortController>();
  private readonly maxHistory = 80;

  list(): TaskRecord[] {
    return [...this.tasks.values()].sort((a, b) =>
      (b.startedAt || '').localeCompare(a.startedAt || ''),
    );
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  cancel(id: string): { ok: boolean; message: string } {
    const task = this.tasks.get(id);
    if (!task) return { ok: false, message: '任务不存在' };
    if (task.status === 'success' || task.status === 'failed' || task.status === 'cancelled') {
      return { ok: false, message: '任务已结束' };
    }
    this.controllers.get(id)?.abort();
    task.status = 'cancelled';
    task.finishedAt = new Date().toISOString();
    task.message = '已取消';
    this.emit('cancelled', task);
    this.emit('progress', task);
    fileLog.app(`[task] cancelled ${task.type} id=${id}`);
    return { ok: true, message: '任务已取消' };
  }

  startTask(type: string, title: string, runner: TaskRunner): { taskId: string } {
    const id = randomUUID();
    const task: TaskRecord = {
      id,
      type,
      title,
      status: 'queued',
      progress: 0,
      message: '排队中…',
    };
    this.tasks.set(id, task);
    this.trimHistory();

    const controller = new AbortController();
    this.controllers.set(id, controller);

    setImmediate(() => {
      void this.run(id, runner, controller);
    });

    return { taskId: id };
  }

  private trimHistory() {
    if (this.tasks.size <= this.maxHistory) return;
    const sorted = this.list();
    for (const t of sorted.slice(this.maxHistory)) {
      this.tasks.delete(t.id);
      this.controllers.delete(t.id);
    }
  }

  private async run(id: string, runner: TaskRunner, controller: AbortController) {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = 'running';
    task.startedAt = new Date().toISOString();
    task.message = '运行中…';
    this.emit('progress', task);

    const started = Date.now();
    try {
      const result = await runner({
        signal: controller.signal,
        progress: (update) => {
          if (controller.signal.aborted) return;
          if (update.progress != null) task.progress = Math.max(0, Math.min(100, update.progress));
          if (update.message) task.message = update.message;
          this.emit('progress', { ...task, partial: update.partial });
        },
      });

      if (controller.signal.aborted) return;

      task.status = 'success';
      task.progress = 100;
      task.result = result;
      task.message = '完成';
      task.finishedAt = new Date().toISOString();
      this.emit('done', task);
      fileLog.app(`[task] done ${task.type} id=${id} duration=${Date.now() - started}ms`);
    } catch (e) {
      if (controller.signal.aborted) return;
      task.status = 'failed';
      task.error = e instanceof Error ? e.message : String(e);
      task.message = task.error;
      task.finishedAt = new Date().toISOString();
      this.emit('failed', task);
      fileLog.app(`[task] failed ${task.type} id=${id} ${task.error}`, 'error');
    } finally {
      this.controllers.delete(id);
    }
  }
}

export const taskManager = new TaskManager();
