import { useCallback, useEffect, useState } from 'react';
import { ListTodo, RefreshCw } from 'lucide-react';
import type { StewardTaskItem } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

const TASK_LABEL: Record<string, string> = {
  scan_upload: 'Agent 扫描上传',
  qianfan_cookie_upload: '千帆 Cookie 上传',
  backup_create: '总控数据库备份',
  workday_start: '今日开工',
  workday_end: '今日收工',
};

export function TasksPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const [tasks, setTasks] = useState<StewardTaskItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTasks((await window.zhuboDesktop.steward.tasks()) as StewardTaskItem[]);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ListTodo className="h-6 w-6 text-primary" /> 后台任务
          </h1>
          <p className="text-sm text-muted-foreground">
            第一版只读 — Agent 扫描 / Cookie / 备份 / 开工收工
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-2">
        {tasks.map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <div className="font-medium">{TASK_LABEL[t.name] || t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.lastRunAt ? new Date(t.lastRunAt).toLocaleString() : '—'}
                </div>
              </div>
              <Badge
                variant={
                  t.lastResult === 'ok'
                    ? 'success'
                    : t.lastResult === 'failed'
                      ? 'destructive'
                      : 'muted'
                }
              >
                {t.lastResult || 'ok'}
              </Badge>
            </CardHeader>
            {t.lastError && (
              <CardContent className="pb-3 text-xs text-red-400">{t.lastError}</CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
