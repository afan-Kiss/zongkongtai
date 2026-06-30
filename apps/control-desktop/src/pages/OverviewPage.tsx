import { useEffect, useState } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ProjectCard } from '@/components/ProjectCard';
import { useAppStore } from '@/stores/appStore';
import { useTaskRunner } from '@/hooks/useTaskRunner';
import { dailyFeaturedProjects } from '@/lib/projectDedup';
import type { HealthCheckReport } from '@zhubo/control-shared';

const HEALTH_CACHE_KEY = 'zhubo:lastHealthReport';

export function OverviewPage() {
  const projects = useAppStore((s) => s.projects);
  const portAnalysis = useAppStore((s) => s.portConflictAnalysis);
  const runningCount = useAppStore((s) => s.runningCount);
  const setPortConflictOpen = useAppStore((s) => s.setPortConflictOpen);
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const { runTask } = useTaskRunner();
  const [refreshing, setRefreshing] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [gitUnpushed, setGitUnpushed] = useState(0);

  const featured = dailyFeaturedProjects(projects);
  const localOk = projects.length > 0;

  useEffect(() => {
    window.zhuboDesktop.git
      .list({ fetchRemote: false })
      .then((rows: Array<{ hasUnpushed?: boolean }>) => {
        setGitUnpushed(rows.filter((r) => r.hasUnpushed).length);
      })
      .catch(() => setGitUnpushed(0));
  }, [projects.length]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const local = await window.zhuboDesktop.projects.loadLocal();
      if (local?.length) useAppStore.getState().setProjects(local as any);
      const portAnalysis = await window.zhuboDesktop.ports.analyze(
        useAppStore.getState().portConflictIgnoredIds,
      );
      useAppStore.getState().setPortConflictAnalysis(portAnalysis);
      const rows = await window.zhuboDesktop.git.list({ fetchRemote: false });
      setGitUnpushed(
        (rows as Array<{ hasUnpushed?: boolean }>).filter((r) => r.hasUnpushed).length,
      );
      pushToast('success', '状态已刷新');
    } catch {
      pushToast('info', '刷新失败，请稍后重试');
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
          <p className="text-sm text-muted-foreground">本地项目 · Git · 端口 · 运行状态</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> 刷新状态
          </Button>
          <Button onClick={quickHealth} disabled={healthBusy}>
            <Activity className={`h-4 w-4 ${healthBusy ? 'animate-pulse' : ''}`} /> 简单体检
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">本地总控</div>
            <div className={`text-lg font-medium ${localOk ? 'text-green-400' : 'text-amber-400'}`}>
              {localOk ? '正常' : '待扫描'}
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">项目</div>
            <div className="text-lg font-medium text-green-400">{projects.length} 个</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">Git</div>
            <div
              className={`text-lg font-medium ${gitUnpushed > 0 ? 'text-amber-400' : 'text-green-400'}`}
            >
              {gitUnpushed > 0 ? `${gitUnpushed} 个未上传` : '已全部上传'}
            </div>
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
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="text-sm text-muted-foreground">运行</div>
            <div className="text-lg font-medium text-green-400">{runningCount} 个</div>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">今日常用项目</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {featured.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export { HEALTH_CACHE_KEY };
