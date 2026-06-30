import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { TaskRecord } from '@/hooks/useTaskRunner';

export function TaskProgressPanel({
  task,
  onCancel,
}: {
  task: TaskRecord | null;
  onCancel?: () => void;
}) {
  const show = task && (task.status === 'running' || task.status === 'queued');

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="pointer-events-auto fixed bottom-20 right-4 z-40 w-80 rounded-lg border border-primary/30 bg-card/95 p-4 shadow-card backdrop-blur"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {task.title}
            </div>
            {onCancel && (
              <Button size="sm" variant="ghost" onClick={onCancel} aria-label="取消任务">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${task.progress}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>
          <div className="text-xs text-muted-foreground">{task.message}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-lg border border-border bg-card/40 p-4">
      <div className="mb-2 h-4 w-1/3 rounded bg-muted" />
      <div className="h-3 w-2/3 rounded bg-muted/80" />
    </div>
  );
}
