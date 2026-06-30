import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ProjectCard } from '@/components/ProjectCard';
import { useAppStore } from '@/stores/appStore';
import { useTaskRunner } from '@/hooks/useTaskRunner';
import { qianfanCookieMessage } from '@/hooks/useCloudBootstrap';
import type { HealthCheckReport } from '@zhubo/control-shared';
import type { GitProjectStatus } from '@zhubo/control-shared';

export function OverviewPage() {
  const projects = useAppStore((s) => s.projects);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const conflictCount = useAppStore((s) => s.conflictCount);
  const qianfanCookieUpdatedAt = useAppStore((s) => s.qianfanCookieUpdatedAt);
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const { runTask } = useTaskRunner();
  const [workdayBusy, setWorkdayBusy] = useState<'start' | 'end' | null>(null);

  const refresh = async () => {
    try {
      const conn = await window.zhuboDesktop.cloud.connect();
      if (!conn.ok) pushToast('error', conn.message);
      else pushToast('success', '已刷新');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    }
  };

  const workdayStart = async () => {
    if (workdayBusy) {
      pushToast('info', '这个任务正在进行中，请稍等。');
      return;
    }
    setWorkdayBusy('start');
    try {
      const result = (await runTask(() => window.zhuboDesktop.steward.workdayStart())) as {
        ok: boolean;
        message: string;
        report: HealthCheckReport;
      };
      pushToast(result.ok ? 'success' : 'info', result.message);
      setPage('health');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setWorkdayBusy(null);
    }
  };

  const workdayEnd = async () => {
    if (workdayBusy) {
      pushToast('info', '这个任务正在进行中，请稍等。');
      return;
    }
    setWorkdayBusy('end');
    try {
      const result = (await runTask(() => window.zhuboDesktop.steward.workdayEnd())) as {
        ok: boolean;
        message: string;
        unpushed: GitProjectStatus[];
      };
      pushToast(result.ok ? 'success' : 'info', result.message);
      if (!result.ok && result.unpushed?.length) setPage('git');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setWorkdayBusy(null);
    }
  };

  const featured = projects.filter((p) =>
    ['辅助出库软件', '祥钰系统', '扫码枪登记出入库系统', '记账系统'].some((n) =>
      p.name.includes(n),
    ),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">总览</h1>
          <p className="text-sm text-muted-foreground">项目管家 — 开工体检 · 收工 Git 检查</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={workdayStart} disabled={workdayBusy === 'start'}>
            <Sun className={`h-4 w-4 ${workdayBusy === 'start' ? 'animate-pulse' : ''}`} /> 今日开工
          </Button>
          <Button variant="secondary" onClick={workdayEnd} disabled={workdayBusy === 'end'}>
            <Moon className={`h-4 w-4 ${workdayBusy === 'end' ? 'animate-pulse' : ''}`} /> 今日收工
          </Button>
          <Button variant="secondary" onClick={refresh}>
            <RefreshCw className="h-4 w-4" /> 刷新
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">云端连接</div>
            <div className="text-lg font-medium">{cloudConnected ? '已连接' : '未连接'}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">端口冲突</div>
            <div className="text-lg font-medium">{conflictCount} 个</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">千帆 Cookie</div>
            <div className="text-sm">{qianfanCookieMessage(qianfanCookieUpdatedAt)}</div>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-medium">优先验证项目</h2>
        <motion.div layout className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {featured.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </motion.div>
      </div>
    </div>
  );
}
