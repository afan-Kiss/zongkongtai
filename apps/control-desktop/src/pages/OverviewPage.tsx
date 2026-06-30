import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ProjectCard } from '@/components/ProjectCard';
import { useAppStore } from '@/stores/appStore';
import { useTaskRunner } from '@/hooks/useTaskRunner';
import { qianfanCookieMessage } from '@/hooks/useCloudBootstrap';
import { dailyFeaturedProjects } from '@/lib/projectDedup';
import type { HealthCheckReport } from '@zhubo/control-shared';

const HEALTH_CACHE_KEY = 'zhubo:lastHealthReport';

export function OverviewPage() {
  const projects = useAppStore((s) => s.projects);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const conflictCount = useAppStore((s) => s.conflictCount);
  const qianfanCookieUpdatedAt = useAppStore((s) => s.qianfanCookieUpdatedAt);
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const { runTask } = useTaskRunner();
  const [refreshing, setRefreshing] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);

  const featured = dailyFeaturedProjects(projects);
  const agentOnline = agentStatus?.state === 'online';

  const refresh = async () => {
    setRefreshing(true);
    try {
      const conn = await window.zhuboDesktop.cloud.connect();
      if (!conn.ok) pushToast('error', conn.message);
      else pushToast('success', '状态已刷新');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
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
      pushToast('success', `体检完成：${result.summary.error} 项异常`);
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
          <p className="text-sm text-muted-foreground">日常项目 · 一键刷新 · 简单体检</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> 刷新状态
          </Button>
          <Button onClick={quickHealth} disabled={healthBusy}>
            <Activity className={`h-4 w-4 ${healthBusy ? 'animate-pulse' : ''}`} /> 一键体检
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">云端总控</div>
            <div
              className={`text-lg font-medium ${cloudConnected ? 'text-green-400' : 'text-red-400'}`}
            >
              {cloudConnected ? '已连接' : '未连接'}
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">本地 Agent</div>
            <div
              className={`text-lg font-medium ${agentOnline ? 'text-green-400' : 'text-amber-400'}`}
            >
              {agentOnline ? '在线' : agentStatus?.message || '离线'}
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">千帆 Cookie</div>
            <div className="text-sm">{qianfanCookieMessage(qianfanCookieUpdatedAt)}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">端口冲突</div>
            <div
              className={`text-lg font-medium ${conflictCount ? 'text-amber-400' : 'text-green-400'}`}
            >
              {conflictCount} 个
            </div>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-medium">日常常用项目</h2>
        {featured.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无匹配项目，请到「项目」页刷新列表。</p>
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
