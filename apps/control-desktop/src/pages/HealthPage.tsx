import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCw, Wrench, ChevronRight, Play } from 'lucide-react';
import type { HealthCheckItem, HealthCheckReport } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAppStore } from '@/stores/appStore';
import { useTaskRunner } from '@/hooks/useTaskRunner';

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

export function HealthPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const [report, setReport] = useState<HealthCheckReport | null>(null);
  const [loadingLight, setLoadingLight] = useState(false);
  const [fullRunning, setFullRunning] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const { runTask } = useTaskRunner();

  const loadLight = useCallback(async () => {
    setLoadingLight(true);
    try {
      const r = (await window.zhuboDesktop.steward.healthCheckLight()) as HealthCheckReport;
      setReport(r);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingLight(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadLight();
  }, [loadLight]);

  const runFull = async () => {
    if (fullRunning) {
      pushToast('info', '这个任务正在进行中，请稍等。');
      return;
    }
    setFullRunning(true);
    try {
      const result = (await runTask(() =>
        window.zhuboDesktop.steward.healthCheck(),
      )) as HealthCheckReport;
      setReport(result);
      pushToast('success', '完整体检完成');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setFullRunning(false);
    }
  };

  const repair = async (item: HealthCheckItem) => {
    if (!item.repairAction) return;
    if (item.repairAction === 'nav:cookies') {
      setPage('cookies');
      return;
    }
    if (item.repairAction === 'nav:git') {
      setPage('git');
      return;
    }
    setRepairing(item.id);
    try {
      const r = await window.zhuboDesktop.steward.repair(item.repairAction);
      pushToast(r.ok ? 'success' : 'error', r.message);
      if (r.ok) await loadLight();
    } finally {
      setRepairing(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Activity className="h-6 w-6 text-primary" /> 系统体检
          </h1>
          <p className="text-sm text-muted-foreground">打开页面仅轻量检查 · 点击开始跑完整体检</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadLight} disabled={loadingLight}>
            <RefreshCw className={`h-4 w-4 ${loadingLight ? 'animate-spin' : ''}`} /> 刷新概览
          </Button>
          <Button onClick={runFull} disabled={fullRunning}>
            <Play className={`h-4 w-4 ${fullRunning ? 'animate-pulse' : ''}`} /> 开始完整体检
          </Button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '正常', n: report.summary.ok, cls: 'text-green-400' },
              { label: '注意', n: report.summary.warn, cls: 'text-amber-400' },
              { label: '异常', n: report.summary.error, cls: 'text-red-400' },
              { label: '可修复', n: report.summary.fixable, cls: 'text-blue-400' },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="text-sm text-muted-foreground">{s.label}</CardHeader>
                <CardContent className={`text-2xl font-semibold ${s.cls}`}>{s.n}</CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            {report.items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`flex items-center gap-3 rounded-lg border p-3 ${STATUS_STYLE[item.status]}`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.status]}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.message}</div>
                  {item.impact && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                      影响：{item.impact}
                    </div>
                  )}
                </div>
                {item.repairable && item.repairAction && (
                  <Tooltip content="一键修复">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={repairing === item.id}
                      onClick={() => repair(item)}
                    >
                      <Wrench
                        className={`h-4 w-4 ${repairing === item.id ? 'animate-spin' : ''}`}
                      />
                      修复
                    </Button>
                  </Tooltip>
                )}
                {!item.repairable && <ChevronRight className="h-4 w-4 text-muted-foreground/40" />}
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
