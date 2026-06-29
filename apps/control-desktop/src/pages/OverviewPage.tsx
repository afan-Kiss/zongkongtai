import { motion } from 'framer-motion';
import { RefreshCw, Sparkles, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { ProjectCard } from '@/components/ProjectCard';
import { useAppStore } from '@/stores/appStore';
import { qianfanCookieMessage } from '@/hooks/useCloudBootstrap';

export function OverviewPage() {
  const projects = useAppStore((s) => s.projects);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const conflictCount = useAppStore((s) => s.conflictCount);
  const qianfanCookieUpdatedAt = useAppStore((s) => s.qianfanCookieUpdatedAt);
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);

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
    try {
      const r = await window.zhuboDesktop.steward.workdayStart();
      pushToast(r.ok ? 'success' : 'info', r.message);
      setPage('health');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    }
  };

  const workdayEnd = async () => {
    try {
      const r = await window.zhuboDesktop.steward.workdayEnd();
      pushToast(r.ok ? 'success' : 'info', r.message);
      if (!r.ok && r.unpushed?.length) setPage('git');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
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
          <Button onClick={workdayStart}>
            <Sun className="h-4 w-4" /> 今日开工
          </Button>
          <Button variant="secondary" onClick={workdayEnd}>
            <Moon className="h-4 w-4" /> 今日收工
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
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-medium">优先验证项目</h2>
          <Badge variant="muted">{featured.length} 个</Badge>
        </div>
        <motion.div layout className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {featured.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </motion.div>
      </div>
    </div>
  );
}
