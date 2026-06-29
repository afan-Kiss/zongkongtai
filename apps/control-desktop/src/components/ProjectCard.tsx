import { motion } from 'framer-motion';
import { Play, Square, RotateCcw, ExternalLink, FolderOpen, Terminal, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge, StatusDot } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import type { Project } from '@/types/desktop';

function statusLabel(status?: string) {
  switch (status) {
    case 'running':
      return '运行中';
    case 'starting':
      return '启动中';
    case 'error':
      return '异常';
    case 'stopping':
      return '停止中';
    case 'stopped':
      return '已停止';
    default:
      return '未启动';
  }
}

function statusVariant(status?: string): 'success' | 'warning' | 'destructive' | 'muted' | 'default' {
  if (status === 'running') return 'success';
  if (status === 'error') return 'destructive';
  if (status === 'starting') return 'warning';
  return 'muted';
}

export function ProjectCard({ project }: { project: Project }) {
  const proc = useAppStore((s) => s.processes[project.id]);
  const pushToast = useAppStore((s) => s.pushToast);
  const setActiveTerminal = useAppStore((s) => s.setActiveTerminal);
  const selectProject = useAppStore((s) => s.selectProject);
  const status = proc?.status || 'idle';
  const ports = project.ports?.slice(0, 3).map((p) => p.port).join(', ') || '—';

  const start = async () => {
    try {
      if (!project.localPath) throw new Error('无本地路径');
      await window.zhuboDesktop.process.start(project);
      setActiveTerminal(project.id);
      pushToast('success', `${project.name} 已开始启动`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    }
  };

  const stop = async () => {
    await window.zhuboDesktop.process.stop(project.id);
    pushToast('info', `${project.name} 已停止`);
  };

  const restart = async () => {
    try {
      await window.zhuboDesktop.process.restart(project);
      pushToast('success', `${project.name} 正在重启`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    }
  };

  const openDir = () => project.localPath && window.zhuboDesktop.shell.openPath(project.localPath);
  const openWeb = async () => {
    const url = await window.zhuboDesktop.project.webUrl(project).catch(() => null);
    const fallback =
      project.healthUrl?.replace(/\/api\/health\/?$/, '') ||
      (project.ports?.[0] ? `http://127.0.0.1:${project.ports[0].port}` : null);
    const target = url || fallback;
    if (target) window.zhuboDesktop.webview.open(project.id, target);
    else pushToast('error', '无法推断 Web 地址');
  };

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
      <Card className="h-full cursor-pointer" onClick={() => selectProject(project.id)}>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <StatusDot status={status} />
                {project.name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{project.category || '未分类'}</div>
            </div>
            <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="truncate text-xs text-muted-foreground" title={project.localPath || ''}>
            {project.localPath || '无本地路径'}
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="muted">端口 {ports}</Badge>
            {proc?.pid && <Badge variant="muted">PID {proc.pid}</Badge>}
          </div>
          <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={start} disabled={status === 'running' || status === 'starting'}>
              <Play className="h-3 w-3" /> 启动
            </Button>
            <Button size="sm" variant="secondary" onClick={stop} disabled={status !== 'running'}>
              <Square className="h-3 w-3" /> 停止
            </Button>
            <Button size="sm" variant="ghost" onClick={restart}>
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={openWeb}>
              <ExternalLink className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={openDir}>
              <FolderOpen className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setActiveTerminal(project.id)}>
              <Terminal className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';

export function RightPanel() {
  const selectedId = useAppStore((s) => s.selectedProjectId);
  const projects = useAppStore((s) => s.projects);
  const project = projects.find((p) => p.id === selectedId);
  const pushToast = useAppStore((s) => s.pushToast);
  const [health, setHealth] = useState<{ ok: boolean; status?: number; message?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [webUrl, setWebUrl] = useState<string | null>(null);

  useEffect(() => {
    setHealth(null);
    if (!project) {
      setWebUrl(null);
      return;
    }
    window.zhuboDesktop.project.webUrl(project).then(setWebUrl).catch(() => setWebUrl(null));
  }, [project?.id]);

  if (!project) {
    return (
      <aside className="w-72 border-l border-border p-4 text-sm text-muted-foreground">
        选择项目查看详情、端口与健康状态
      </aside>
    );
  }

  const conflicts = project.ports?.filter((p) => p.conflictLevel === 'conflict') || [];
  const healthTarget =
    project.localHealthUrl ||
    project.healthUrl ||
    (webUrl ? `${webUrl}/api/health` : null);

  const runHealth = async () => {
    if (!healthTarget) {
      pushToast('error', '未配置健康检查地址');
      return;
    }
    setChecking(true);
    try {
      const res = await window.zhuboDesktop.cloud.healthCheck(healthTarget);
      setHealth(res);
    } catch (e) {
      setHealth({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecking(false);
    }
  };

  return (
    <aside className="w-72 overflow-auto border-l border-border p-4 text-sm">
      <h3 className="mb-2 font-medium">{project.name}</h3>
      <div className="space-y-3 text-xs text-muted-foreground">
        <div>
          <div className="text-foreground">桌面启动命令</div>
          <div className="mt-1 break-all">{project.desktopStartCommand || project.devCommand || project.startCommand || '使用本地 desktop 默认'}</div>
        </div>
        <div>
          <div className="flex items-center justify-between text-foreground">
            <span>健康检查</span>
            <Button size="sm" variant="ghost" onClick={runHealth} disabled={checking}>
              <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="mt-1 break-all">{healthTarget || '—'}</div>
          {health && (
            <div className={health.ok ? 'text-green-400' : 'text-red-400'}>
              {health.ok ? `正常 HTTP ${health.status}` : health.message || '检查失败'}
            </div>
          )}
        </div>
        {webUrl && (
          <div>
            <div className="text-foreground">本地 Web</div>
            <div className="mt-1 break-all">{webUrl}</div>
          </div>
        )}
        {conflicts.length > 0 && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-red-300">
            {conflicts.map((p) => (
              <div key={p.id}>端口 {p.port}：{p.conflictReason}</div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
