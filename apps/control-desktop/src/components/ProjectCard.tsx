import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Square,
  RotateCcw,
  ExternalLink,
  FolderOpen,
  Terminal,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { AccessUrlCard } from '@/components/AccessUrlCard';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge, StatusDot } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAppStore } from '@/stores/appStore';
import type { Project } from '@/types/desktop';
import {
  DEFAULT_RISK_BY_CODE,
  normalizeRiskLevel,
  riskRequiresConfirm,
} from '@zhubo/control-shared';

const RISK_LABEL: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  protected: '受保护',
};

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

function statusVariant(
  status?: string,
): 'success' | 'warning' | 'destructive' | 'muted' | 'default' {
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
  const risk = normalizeRiskLevel(
    (project as Project & { riskLevel?: string }).riskLevel || DEFAULT_RISK_BY_CODE[project.code],
  );
  const riskGate = riskRequiresConfirm(risk);
  const isProtected = risk === 'protected';
  const ports =
    project.ports
      ?.slice(0, 3)
      .map((p) => p.port)
      .join(', ') || '—';
  const isRunning = status === 'running';
  const isError = status === 'error';

  const start = async () => {
    try {
      if (riskGate === 'blocked') {
        pushToast('error', '这个项目是 protected，不能从 EXE 自动启动。');
        return;
      }
      if (
        riskGate === 'high' &&
        !confirm(`高风险项目「${project.name}」\n影响：可能影响线上服务或核心数据\n确定启动？`)
      )
        return;
      if (riskGate === 'medium' && !confirm(`中等风险项目「${project.name}」，确定启动？`)) return;
      if (!project.localPath) throw new Error('无本地路径');
      await window.zhuboDesktop.process.start(project);
      setActiveTerminal(project.id);
      const url = await window.zhuboDesktop.project.webUrl(project).catch(() => null);
      const target = url || project.localWebUrl;
      pushToast(
        'success',
        target ? `项目已启动，可访问地址：${target}` : `${project.name} 已开始启动`,
      );
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    }
  };

  const stop = async () => {
    if (isProtected) {
      pushToast('error', '这个项目是 protected，不能从 EXE 自动停止。');
      return;
    }
    if (riskGate === 'high' && !confirm(`高风险项目「${project.name}」\n确定停止？`)) return;
    if (riskGate === 'medium' && !confirm(`中等风险项目「${project.name}」，确定停止？`)) return;
    await window.zhuboDesktop.process.stop(project.id, project);
    pushToast('info', `${project.name} 已停止`);
  };

  const restart = async () => {
    if (isProtected) {
      pushToast('error', '这个项目是 protected，不能从 EXE 自动重启。');
      return;
    }
    if (riskGate === 'high' && !confirm(`高风险项目「${project.name}」\n确定重启？`)) return;
    if (riskGate === 'medium' && !confirm(`中等风险项目「${project.name}」，确定重启？`)) return;
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
      project.localWebUrl ||
      project.healthUrl?.replace(/\/api\/health\/?$/, '') ||
      (project.ports?.[0] ? `http://127.0.0.1:${project.ports[0].port}` : null);
    const target = url || fallback;
    if (target) window.zhuboDesktop.webview.open(project.id, target);
    else pushToast('error', '无法推断 Web 地址');
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={
        isRunning
          ? 'rounded-lg ring-1 ring-green-500/30'
          : isError
            ? 'rounded-lg ring-1 ring-red-500/30'
            : ''
      }
    >
      <Card
        className={`h-full cursor-pointer ${isRunning ? 'shadow-[0_0_24px_rgba(74,222,128,0.12)]' : ''}`}
        onClick={() => selectProject(project.id)}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <StatusDot status={status} />
                {project.name}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{project.category || '未分类'}</span>
                <Badge
                  variant={
                    risk === 'low' ? 'success' : risk === 'protected' ? 'destructive' : 'warning'
                  }
                >
                  {RISK_LABEL[risk] || risk}
                </Badge>
              </div>
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
            {!isProtected && (
              <>
                <Tooltip content="启动这个项目，并在下方显示终端日志">
                  <Button
                    size="sm"
                    onClick={start}
                    disabled={status === 'running' || status === 'starting'}
                  >
                    <Play className="h-3 w-3" /> 启动
                  </Button>
                </Tooltip>
                {risk !== 'high' && (
                  <>
                    <Tooltip content="停止由总控启动的进程">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={stop}
                        disabled={status !== 'running'}
                      >
                        <Square className="h-3 w-3" /> 停止
                      </Button>
                    </Tooltip>
                    <Tooltip content="先停止再重新启动">
                      <Button size="sm" variant="ghost" onClick={restart}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </Tooltip>
                  </>
                )}
                {risk === 'high' && (
                  <>
                    <Tooltip content="高风险：停止需强确认">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={stop}
                        disabled={status !== 'running'}
                      >
                        <Square className="h-3 w-3" /> 停止
                      </Button>
                    </Tooltip>
                    <Tooltip content="高风险：重启需强确认">
                      <Button size="sm" variant="ghost" onClick={restart}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </>
            )}
            <Tooltip content="在总控里打开项目页面">
              <Button size="sm" variant="ghost" onClick={openWeb}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Tooltip>
            <Tooltip content="打开项目源码目录">
              <Button size="sm" variant="ghost" onClick={openDir}>
                <FolderOpen className="h-3 w-3" />
              </Button>
            </Tooltip>
            <Tooltip content="切换到底部终端">
              <Button size="sm" variant="ghost" onClick={() => setActiveTerminal(project.id)}>
                <Terminal className="h-3 w-3" />
              </Button>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function RightPanel() {
  const selectedId = useAppStore((s) => s.selectedProjectId);
  const projects = useAppStore((s) => s.projects);
  const proc = useAppStore((s) =>
    selectedId ? useAppStore.getState().processes[selectedId] : undefined,
  );
  const project = projects.find((p) => p.id === selectedId);
  const pushToast = useAppStore((s) => s.pushToast);
  const [health, setHealth] = useState<{ ok: boolean; status?: number; message?: string } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [webUrl, setWebUrl] = useState<string | null>(null);

  useEffect(() => {
    setHealth(null);
    if (!project) {
      setWebUrl(null);
      return;
    }
    window.zhuboDesktop.project
      .webUrl(project)
      .then(setWebUrl)
      .catch(() => setWebUrl(null));
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
    project.localHealthUrl || project.healthUrl || (webUrl ? `${webUrl}/api/health` : null);

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

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    pushToast('success', '已复制地址');
  };

  return (
    <aside className="w-80 overflow-auto border-l border-border p-4 text-sm">
      <h3 className="mb-2 font-medium">{project.name}</h3>
      <div className="space-y-3 text-xs text-muted-foreground">
        <AccessUrlCard
          project={project}
          webUrl={webUrl}
          visible={proc?.status === 'running'}
          onCopy={copyUrl}
          onOpen={(url) => window.zhuboDesktop.webview.open(project.id, url)}
          onExternal={(url) => window.zhuboDesktop.shell.openExternal(url)}
        />

        <div>
          <div className="text-foreground">桌面启动命令</div>
          <div className="mt-1 break-all">
            {project.desktopStartCommand ||
              project.devCommand ||
              project.startCommand ||
              '使用本地 desktop 默认'}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-foreground">
            <span>健康检查</span>
            <Tooltip content="检查这个项目是否正常响应">
              <Button size="sm" variant="ghost" onClick={runHealth} disabled={checking}>
                <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
              </Button>
            </Tooltip>
          </div>
          <div className="mt-1 break-all">{healthTarget || '—'}</div>
          {health && (
            <div className={health.ok ? 'text-green-400' : 'text-red-400'}>
              {health.ok ? `正常 HTTP ${health.status}` : health.message || '检查失败'}
            </div>
          )}
        </div>
        {conflicts.length > 0 && (
          <div className="animate-pulse-error rounded-md border border-red-500/30 bg-red-500/5 p-2 text-red-300">
            {conflicts.map((p) => (
              <div key={p.id}>
                端口 {p.port}：{p.conflictReason}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
