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

export interface UseTaskRunnerOptions {
  /** 仅关注这些 type（支持 `git:commitPush` 匹配 `git:commitPush:/path`） */
  acceptedTypes?: string[];
}

function typeMatches(taskType: string, accepted?: string[]) {
  if (!accepted?.length) return true;
  return accepted.some((t) => taskType === t || taskType.startsWith(`${t}:`));
}

export function useTaskRunner(opts?: UseTaskRunnerOptions) {
  const [active, setActive] = useState<TaskRecord | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const waiters = useRef(
    new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>(),
  );
  const acceptedTypes = opts?.acceptedTypes;

  useEffect(() => {
    const isCurrent = (t: TaskRecord) => t.id === activeIdRef.current;

    const offProgress = window.zhuboDesktop.tasks.onProgress((task) => {
      const t = task as TaskRecord;
      if (!isCurrent(t)) return;
      if (!typeMatches(t.type, acceptedTypes)) return;
      setActive(t);
    });
    const offDone = window.zhuboDesktop.tasks.onDone((task) => {
      const t = task as TaskRecord;
      if (!isCurrent(t)) return;
      setActive(t);
      waiters.current.get(t.id)?.resolve(t.result);
      waiters.current.delete(t.id);
      if (t.id === activeIdRef.current) activeIdRef.current = null;
    });
    const offFailed = window.zhuboDesktop.tasks.onFailed((task) => {
      const t = task as TaskRecord;
      if (!isCurrent(t)) return;
      setActive(t);
      waiters.current.get(t.id)?.reject(new Error(t.error || '任务失败'));
      waiters.current.delete(t.id);
      if (t.id === activeIdRef.current) activeIdRef.current = null;
    });
    const offCancelled = window.zhuboDesktop.tasks.onCancelled((task) => {
      const t = task as TaskRecord;
      if (!isCurrent(t)) return;
      setActive(t);
      waiters.current.get(t.id)?.reject(new Error('任务已取消'));
      waiters.current.delete(t.id);
      if (t.id === activeIdRef.current) activeIdRef.current = null;
    });
    return () => {
      offProgress();
      offDone();
      offFailed();
      offCancelled();
    };
  }, [acceptedTypes]);

  const runTask = useCallback(async (starter: () => Promise<{ taskId: string }>) => {
    const { taskId } = await starter();
    activeIdRef.current = taskId;
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
    const id = activeIdRef.current;
    if (id) await window.zhuboDesktop.tasks.cancel(id);
  }, []);

  return { active, runTask, cancel, setActive };
}
