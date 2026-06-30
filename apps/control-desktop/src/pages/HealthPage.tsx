import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCw, Play, ChevronRight } from 'lucide-react';
import type { HealthCheckItem, HealthCheckReport } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { useTaskRunner } from '@/hooks/useTaskRunner';
import { HEALTH_CACHE_KEY } from '@/pages/OverviewPage';

const STATUS_STYLE: Record<string, string> = {
  ok: 'border-green-500/40 bg-green-500/10',
  warn: 'border-amber-500/40 bg-amber-500/10',
  error: 'border-red-500/40 bg-red-500/10',
  fixable: 'border-blue-500/40 bg-blue-500/10',
  skipped: 'border-border bg-card/30',
};

const DOT: Record<string, string> = {
  ok: 'bg-green-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
  fixable: 'bg-blue-400',
  skipped: 'bg-muted-foreground',
};

const SIMPLE_IDS = new Set([
  'cloud',
  'agent',
  'qianfan-cookie',
  'ports',
  'projects-health',
  'git-unpushed',
  'duplicate-projects',
]);

function loadCachedReport(): HealthCheckReport | null {
  try {
    const raw = sessionStorage.getItem(HEALTH_CACHE_KEY);
    return raw ? (JSON.parse(raw) as HealthCheckReport) : null;
  } catch {
    return null;
  }
}

export function HealthPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const [report, setReport] = useState<HealthCheckReport | null>(() => loadCachedReport());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { runTask, active } = useTaskRunner();

  const runCheck = useCallback(async () => {
    if (running) {
      pushToast('info', '体检正在进行，请稍等');
      return;
    }
    setRunning(true);
    setLoadError(null);
    try {
      const result = (await runTask(() =>
        window.zhuboDesktop.steward.healthCheck(),
      )) as HealthCheckReport;
      setReport(result);
      sessionStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(result));
      pushToast('success', '简单体检完成');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      pushToast('error', msg);
    } finally {
      setRunning(false);
    }
  }, [pushToast, runTask, running]);

  const goFix = (item: HealthCheckItem) => {
    if (item.repairAction === 'nav:cookies') setPage('cookies');
    else if (item.repairAction === 'nav:git') setPage('git');
    else if (item.repairAction === 'nav:ports') setPage('ports');
    else if (item.repairAction === 'nav:projects') setPage('projects');
  };

  const items = (report?.items || []).filter(
    (i) => SIMPLE_IDS.has(i.id) || report!.items.length <= 12,
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Activity className="h-6 w-6 text-primary" /> 简单体检
          </h1>
          <p className="text-sm text-muted-foreground">
            只看关键 7 项 · 点击「开始体检」后再跑，不会自动重任务
          </p>
        </div>
        <Button onClick={runCheck} disabled={running}>
          <Play className={`h-4 w-4 ${running ? 'animate-pulse' : ''}`} /> 开始体检
        </Button>
      </div>

      {running && active && (
        <Card className="border-primary/30">
          <CardContent className="py-4">
            <div className="mb-2 text-sm">{active.message || '正在体检…'}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${active.progress || 10}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {loadError && !report && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-4 text-sm">
            <p className="text-red-300">这个页面暂时加载失败：{loadError}</p>
            <Button size="sm" className="mt-3" variant="secondary" onClick={runCheck}>
              <RefreshCw className="h-4 w-4" /> 重试
            </Button>
          </CardContent>
        </Card>
      )}

      {!report && !loadError && !running && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            还没有体检结果，点击上方「开始体检」即可。
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '正常', n: report.summary.ok, cls: 'text-green-400' },
              { label: '注意', n: report.summary.warn, cls: 'text-amber-400' },
              { label: '有问题', n: report.summary.error, cls: 'text-red-400' },
              { label: '可处理', n: report.summary.fixable, cls: 'text-blue-400' },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="text-sm text-muted-foreground">{s.label}</CardHeader>
                <CardContent className={`text-2xl font-semibold ${s.cls}`}>{s.n}</CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`flex items-center gap-3 rounded-lg border p-3 ${STATUS_STYLE[item.status]}`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.status]}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.message}</div>
                </div>
                {(item.repairAction?.startsWith('nav:') || item.status !== 'ok') && (
                  <Button size="sm" variant="secondary" onClick={() => goFix(item)}>
                    去处理 <ChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
