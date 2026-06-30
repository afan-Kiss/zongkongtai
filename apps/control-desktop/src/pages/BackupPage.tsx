import { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, RotateCcw, Shield } from 'lucide-react';
import type { BackupRecord } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { CloudGate } from '@/components/CloudGate';

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function BackupPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = (await window.zhuboDesktop.steward.backups()) as BackupRecord[];
      setBackups(list);
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

  const createBackup = async () => {
    if (!confirm('立即备份总控生产数据库 prod.db？')) return;
    setBusy(true);
    try {
      const r = await window.zhuboDesktop.steward.createBackup('manual');
      pushToast('success', '备份成功');
      await refresh();
      return r;
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (b: BackupRecord) => {
    if (
      !confirm(
        `确定恢复备份 ${b.label}？\n将覆盖 prod.db 并仅重启 zhubo-control-center。\n主播分析 / nginx / x-ui 不会动。`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await window.zhuboDesktop.steward.restoreBackup(b.id);
      pushToast(r.ok ? 'success' : 'error', r.message);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CloudGate title="备份回滚（高级工具）">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Database className="h-6 w-6 text-primary" /> 备份与回滚
            </h1>
            <p className="text-sm text-muted-foreground">
              第一版：总控 prod.db · 路径 apps/control-server/prod.db
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={createBackup} disabled={busy}>
              <Shield className="h-4 w-4" /> 立即备份
            </Button>
          </div>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4 text-sm text-muted-foreground">
            部署前、重要修复前建议先备份。恢复时只会重启 zhubo-control-center，不会动主播分析 /
            nginx / x-ui。
          </CardContent>
        </Card>

        <div className="space-y-3">
          {backups.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground">
              暂无备份，点击「立即备份」创建第一份。
            </div>
          )}
          {backups.map((b) => (
            <Card key={b.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <div className="font-medium">{b.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString()} · {fmtSize(b.sizeBytes)}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !b.restorable}
                  onClick={() => restore(b)}
                >
                  <RotateCcw className="h-4 w-4" /> 恢复
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </CloudGate>
  );
}
