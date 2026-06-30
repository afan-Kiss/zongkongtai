import { useCallback, useEffect, useState } from 'react';
import { Rocket, RefreshCw, ShieldAlert } from 'lucide-react';
import type { DeploymentRecord } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { CloudGate } from '@/components/CloudGate';

export function DeployPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const [rows, setRows] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await window.zhuboDesktop.steward.deployments()) as DeploymentRecord[]);
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
    <CloudGate title="部署记录（高级工具）">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Rocket className="h-6 w-6 text-primary" /> 部署记录
            </h1>
            <p className="text-sm text-muted-foreground">每次部署 / 重启服务均记录闸门检查结果</p>
          </div>
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            部署前闸门：Git 已 push · 有 DB 备份 · 不重置 Token · 不 db push · 不重启 nginx
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="secondary" onClick={() => setPage('backup')}>
              去备份中心
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {rows.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground">
              暂无部署记录（增量部署成功后会写入）。
            </div>
          )}
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <div className="font-medium">{r.projectName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.deployedAt).toLocaleString()} · {r.deployedBy}
                  </div>
                  {r.gitCommit && <div className="mt-1 font-mono text-[10px]">{r.gitCommit}</div>}
                </div>
                <Badge
                  variant={
                    r.result === 'success'
                      ? 'success'
                      : r.result === 'failed'
                        ? 'destructive'
                        : 'warning'
                  }
                >
                  {r.result}
                </Badge>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground md:grid-cols-4">
                <span>备份 DB：{r.backedUpDb ? '是' : '否'}</span>
                <span>重启 control：{r.restartedControlCenter ? '是' : '否'}</span>
                <span>重启 analysis：{r.restartedAnalysis ? '是' : '否'}</span>
                <span>重启 nginx：{r.restartedNginx ? '是' : '否'}</span>
                {r.failureReason && (
                  <span className="col-span-full text-red-400">{r.failureReason}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </CloudGate>
  );
}
