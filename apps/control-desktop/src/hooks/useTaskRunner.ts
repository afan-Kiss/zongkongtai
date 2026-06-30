import { useCallback, useEffect, useRef, useState } from 'react';

export interface TaskRecord {
  id: string;
  type: string;
  title: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  error?: string;
  result?: unknown;
}

export function useTaskRunner() {
  const [active, setActive] = useState<TaskRecord | null>(null);
  const waiters = useRef(
    new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>(),
  );

  useEffect(() => {
    const offProgress = window.zhuboDesktop.tasks.onProgress((task) => {
      setActive(task as TaskRecord);
    });
    const offDone = window.zhuboDesktop.tasks.onDone((task) => {
      const t = task as TaskRecord;
      setActive(t);
      waiters.current.get(t.id)?.resolve(t.result);
      waiters.current.delete(t.id);
    });
    const offFailed = window.zhuboDesktop.tasks.onFailed((task) => {
      const t = task as TaskRecord;
      setActive(t);
      waiters.current.get(t.id)?.reject(new Error(t.error || '任务失败'));
      waiters.current.delete(t.id);
    });
    const offCancelled = window.zhuboDesktop.tasks.onCancelled((task) => {
      const t = task as TaskRecord;
      setActive(t);
      waiters.current.get(t.id)?.reject(new Error('任务已取消'));
      waiters.current.delete(t.id);
    });
    return () => {
      offProgress();
      offDone();
      offFailed();
      offCancelled();
    };
  }, []);

  const runTask = useCallback(async (starter: () => Promise<{ taskId: string }>) => {
    const { taskId } = await starter();
    setActive({
      id: taskId,
      type: '',
      title: '…',
      status: 'running',
      progress: 0,
      message: '开始…',
    });
    return new Promise<unknown>((resolve, reject) => {
      waiters.current.set(taskId, { resolve, reject });
    });
  }, []);

  const cancel = useCallback(async () => {
    if (active?.id) await window.zhuboDesktop.tasks.cancel(active.id);
  }, [active?.id]);

  return { active, runTask, cancel, setActive };
}
