import { useCallback, useEffect, useState } from 'react';
import { ListTodo, RefreshCw } from 'lucide-react';
import type { StewardTaskItem } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { CloudGate } from '@/components/CloudGate';

const TASK_LABEL: Record<string, string> = {
  scan_upload: 'Agent 扫描上传',
  qianfan_cookie_upload: '千帆 Cookie 上传',
  backup_create: '总控数据库备份',
  workday_start: '今日开工',
  workday_end: '今日收工',
};

export function TasksPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
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
    if (!cloudConnected) return;
    void refresh();
  }, [cloudConnected, refresh]);

  return (
    <CloudGate title="后台任务（高级工具）">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <ListTodo className="h-6 w-6 text-primary" /> 后台任务
            </h1>
            <p className="text-sm text-muted-foreground">高级工具 — 只读查看历史任务</p>
          </div>
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="space-y-2">
          {tasks.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground">暂无后台任务记录。</div>
          )}
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
    </CloudGate>
  );
}
