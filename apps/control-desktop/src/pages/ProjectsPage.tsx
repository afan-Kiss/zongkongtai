import { useMemo, useState } from 'react';
import { FolderSync, RefreshCw, Upload } from 'lucide-react';
import { categoryToGroup, PROJECT_GROUP_ORDER, type ProjectGroup } from '@zhubo/control-shared';
import { ProjectCard, RightPanel } from '@/components/ProjectCard';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { filterDisplayProjects } from '@/lib/projectDedup';

type EnrichedProject = Project & { manifestFavorite?: boolean; manifestGroup?: string };

function projectGroup(p: EnrichedProject): ProjectGroup {
  if (p.manifestGroup && PROJECT_GROUP_ORDER.includes(p.manifestGroup as ProjectGroup)) {
    return p.manifestGroup as ProjectGroup;
  }
  return categoryToGroup(p.category || '', p.manifestFavorite);
}

export function ProjectsPage() {
  const projectsClean = useAppStore((s) => s.projects) as EnrichedProject[];
  const projectsRawStore = useAppStore((s) => s.projectsRaw) as EnrichedProject[];
  const showDuplicateProjects = useAppStore((s) => s.showDuplicateProjects);
  const setShowDuplicateProjects = useAppStore((s) => s.setShowDuplicateProjects);
  const source = showDuplicateProjects ? projectsRawStore : projectsClean;
  const projects = filterDisplayProjects(source, { showDuplicates: showDuplicateProjects });
  const setProjects = useAppStore((s) => s.setProjects);
  const pushToast = useAppStore((s) => s.pushToast);
  const [activeGroup, setActiveGroup] = useState<ProjectGroup | '全部'>('全部');
  const [busy, setBusy] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<ProjectGroup, EnrichedProject[]>();
    for (const g of PROJECT_GROUP_ORDER) map.set(g, []);
    for (const p of projects) {
      const g = projectGroup(p);
      map.get(g)?.push(p);
    }
    return map;
  }, [projects]);

  const visible =
    activeGroup === '全部' ? projects : grouped.get(activeGroup as ProjectGroup) || [];

  const refreshList = async () => {
    setBusy('refresh');
    try {
      const list = await window.zhuboDesktop.projects.refresh();
      setProjects(list as Project[]);
      pushToast('success', `已刷新 ${list.length} 个项目`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const rescanDisk = async () => {
    setBusy('rescan');
    try {
      const res = await window.zhuboDesktop.projects.rescanDisk();
      if (res.projects) setProjects(res.projects as Project[]);
      pushToast(res.ok ? 'success' : 'error', res.message);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const importManifests = async () => {
    setBusy('import');
    try {
      const res = await window.zhuboDesktop.manifest.import();
      if (res.ok) {
        const list = await window.zhuboDesktop.projects.refresh();
        setProjects(list as Project[]);
      }
      pushToast(res.ok ? 'success' : 'error', res.message || '导入完成');
      if (res.warnings?.length) {
        res.warnings.forEach((w: string) => pushToast('info', w));
      }
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-44 shrink-0 border-r border-border p-3 text-sm">
        <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">项目分组</div>
        <nav className="flex flex-col gap-0.5">
          {(['全部', ...PROJECT_GROUP_ORDER] as const).map((g) => {
            const count =
              g === '全部' ? projects.length : (grouped.get(g as ProjectGroup)?.length ?? 0);
            if (g !== '全部' && count === 0) return null;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setActiveGroup(g)}
                className={cn(
                  'flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  activeGroup === g
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span>{g}</span>
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h1 className="mr-auto text-lg font-semibold">项目</h1>
          <Tooltip content="从云端总控重新拉取项目列表">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={refreshList}>
              <RefreshCw className={`h-3.5 w-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
              刷新项目清单
            </Button>
          </Tooltip>
          <Tooltip content="扫描 E:\\我的软件源码 并上传端口/启动命令到总控（需 Agent 或本机源码）">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={rescanDisk}>
              <FolderSync className={`h-3.5 w-3.5 ${busy === 'rescan' ? 'animate-spin' : ''}`} />
              重新扫描 E 盘项目
            </Button>
          </Tooltip>
          <Tooltip content="读取各项目 zhubo-control.manifest.json 并导入总控档案">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={importManifests}>
              <Upload className="h-3.5 w-3.5" />从 manifest 导入
            </Button>
          </Tooltip>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDuplicateProjects}
              onChange={(e) => setShowDuplicateProjects(e.target.checked)}
            />
            显示历史/重复项目
          </label>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              当前分组暂无项目。可点击「从 manifest 导入」或「重新扫描 E 盘项目」。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      <RightPanel />
    </div>
  );
}
