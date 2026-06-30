import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { TaskRecord } from '@/hooks/useTaskRunner';

function isActiveTask(t: TaskRecord) {
  return t.status === 'running' || t.status === 'queued';
}

export function GlobalTaskBar() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [minimized, setMinimized] = useState(false);

  const refresh = useCallback(async () => {
    const list = (await window.zhuboDesktop.tasks.list()) as TaskRecord[];
    setTasks(list);
  }, []);

  useEffect(() => {
    void refresh();
    const offs = [
      window.zhuboDesktop.tasks.onProgress(() => void refresh()),
      window.zhuboDesktop.tasks.onDone(() => void refresh()),
      window.zhuboDesktop.tasks.onFailed(() => void refresh()),
      window.zhuboDesktop.tasks.onCancelled(() => void refresh()),
    ];
    return () => offs.forEach((o) => o());
  }, [refresh]);

  const running = tasks.filter(isActiveTask);
  if (!running.length) return null;

  const primary = running[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="pointer-events-auto z-50 border-b border-primary/20 bg-card/95 px-4 py-2 shadow-sm backdrop-blur"
      >
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            {minimized ? (
              <div className="truncate text-sm">
                {running.length} 个后台任务进行中 — {primary.title}
              </div>
            ) : (
              <div className="space-y-2">
                {running.map((task) => (
                  <div key={task.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{task.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{task.message}</div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="取消任务"
                      onClick={() => window.zhuboDesktop.tasks.cancel(task.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label={minimized ? '展开任务' : '最小化任务条'}
            onClick={() => setMinimized((v) => !v)}
          >
            {minimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
