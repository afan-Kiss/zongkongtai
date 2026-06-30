import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ProjectCard } from '@/components/ProjectCard';
import { useAppStore } from '@/stores/appStore';
import { useTaskRunner } from '@/hooks/useTaskRunner';
import { qianfanStaleMessage } from '@/hooks/useCloudBootstrap';
import { dailyFeaturedProjects } from '@/lib/projectDedup';
import { cloudFailToastMessage } from '@/lib/cloudStatus';
import type { HealthCheckReport } from '@zhubo/control-shared';

const HEALTH_CACHE_KEY = 'zhubo:lastHealthReport';

export function OverviewPage() {
  const projects = useAppStore((s) => s.projects);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const portAnalysis = useAppStore((s) => s.portConflictAnalysis);
  const setPortConflictOpen = useAppStore((s) => s.setPortConflictOpen);
  const qianfanCookieUpdatedAt = useAppStore((s) => s.qianfanCookieUpdatedAt);
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const { runTask } = useTaskRunner();
  const [refreshing, setRefreshing] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);

  const featured = dailyFeaturedProjects(projects);
  const localOk = projects.length > 0;

  const cookieSummary = qianfanStaleMessage(qianfanCookieUpdatedAt, cloudConnected);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await window.zhuboDesktop.projects.loadLocal().then((local) => {
        if (local?.length) useAppStore.getState().setProjects(local as any);
      });
      const conn = await window.zhuboDesktop.cloud.connect();
      if (!conn.ok) pushToast('info', cloudFailToastMessage());
      else pushToast('success', '状态已刷新');
    } catch {
      pushToast('info', cloudFailToastMessage());
    } finally {
      setRefreshing(false);
    }
  };

  const quickHealth = async () => {
    if (healthBusy) {
      pushToast('info', '体检正在进行，请稍等');
      return;
    }
    setHealthBusy(true);
    try {
      const result = (await runTask(() =>
        window.zhuboDesktop.steward.healthCheck(),
      )) as HealthCheckReport;
      sessionStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(result));
      const warn = result?.summary?.warn ?? 0;
      pushToast('success', `体检完成${warn ? `，${warn} 项需关注` : ''}`);
      setPage('health');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setHealthBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">总览</h1>
          <p className="text-sm text-muted-foreground">本地优先 · 常用项目 · 刷新状态 · 简单体检</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> 刷新状态
          </Button>
          <Button onClick={quickHealth} disabled={healthBusy}>
            <Activity className={`h-4 w-4 ${healthBusy ? 'animate-pulse' : ''}`} /> 开始简单体检
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">本地总控</div>
            <div className={`text-lg font-medium ${localOk ? 'text-green-400' : 'text-amber-400'}`}>
              {localOk ? '正常' : '待扫描'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">本地项目、Git、终端可用</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">云端同步</div>
            <div
              className={`text-lg font-medium ${cloudConnected ? 'text-green-400' : 'text-muted-foreground'}`}
            >
              {cloudConnected ? '已连接' : '未连接'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {cloudConnected ? 'Cookie 与远程状态已同步' : '不影响本地使用'}
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">Cookie 同步</div>
            <div
              className={`text-sm font-medium ${
                !cloudConnected
                  ? 'text-muted-foreground'
                  : qianfanCookieUpdatedAt
                    ? 'text-green-400'
                    : 'text-amber-400'
              }`}
            >
              {!cloudConnected ? '需连接云端' : qianfanCookieUpdatedAt ? '正常' : '暂未收到'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{cookieSummary}</div>
          </CardHeader>
        </Card>
        <Card
          className={
            portAnalysis?.topBarClickable
              ? 'cursor-pointer transition-colors hover:bg-accent/20'
              : ''
          }
          onClick={() => portAnalysis?.topBarClickable && setPortConflictOpen(true)}
        >
          <CardHeader>
            <div className="text-sm text-muted-foreground">端口</div>
            <div
              className={`text-lg font-medium ${
                portAnalysis?.seriousCount
                  ? 'text-amber-400'
                  : portAnalysis?.duplicateCount
                    ? 'text-muted-foreground'
                    : 'text-green-400'
              }`}
            >
              {portAnalysis?.seriousCount ? '有冲突' : portAnalysis?.topBarText || '正常'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {portAnalysis?.topBarClickable ? '点击查看详情' : '端口状态良好'}
            </div>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-medium">日常常用项目</h2>
        {featured.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无匹配项目。可到「项目」页从 manifest 导入，或检查设置里的扫描根目录。
          </p>
        ) : (
          <motion.div layout className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {featured.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export { HEALTH_CACHE_KEY };
