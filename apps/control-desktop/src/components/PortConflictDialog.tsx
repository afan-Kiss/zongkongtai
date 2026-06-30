import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  RefreshCw,
  Copy,
  FolderOpen,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { PortConflictAnalysis, PortConflictItem } from '@zhubo/control-shared';
import { formatPortConflictCopy } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

const TYPE_LABEL: Record<PortConflictItem['type'], string> = {
  duplicate_registration: '重复登记',
  config_conflict: '配置冲突',
  real_occupation: '真实占用',
};

const TYPE_VARIANT: Record<
  PortConflictItem['type'],
  'success' | 'warning' | 'destructive' | 'muted'
> = {
  duplicate_registration: 'muted',
  config_conflict: 'warning',
  real_occupation: 'destructive',
};

function ConflictRow({
  item,
  onIgnore,
  onRefresh,
}: {
  item: PortConflictItem;
  onIgnore: (id: string) => void;
  onRefresh: () => void;
}) {
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const selectProject = useAppStore((s) => s.selectProject);
  const setPortConflictOpen = useAppStore((s) => s.setPortConflictOpen);
  const [busy, setBusy] = useState(false);
  const [dedupePreview, setDedupePreview] = useState<string | null>(null);

  const copyDetail = () => {
    navigator.clipboard.writeText(formatPortConflictCopy(item));
    pushToast('success', '已复制详情');
  };

  const openProject = () => {
    const target = item.projects[0];
    if (!target?.id) {
      pushToast('info', '没有关联项目');
      return;
    }
    selectProject(target.id);
    setPage('projects');
    setPortConflictOpen(false);
  };

  const killProcess = async () => {
    if (!item.pid || !item.killProjectId) return;
    const ok = window.confirm(
      `这个进程是总控启动并托管的旧进程，可以关闭。确定关闭吗？\n\n进程：${item.processName || '未知'} (PID ${item.pid})\n端口：${item.port}`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const ignored = useAppStore.getState().portConflictIgnoredIds;
      const res = await window.zhuboDesktop.ports.safeKill({
        pid: item.pid,
        projectId: item.killProjectId,
        port: item.port,
        ignoredIds: ignored,
      });
      pushToast(res.ok ? 'success' : 'error', res.message);
      if (res.ok) onRefresh();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const previewDedupe = async () => {
    const proj = item.projects[0];
    if (!proj?.localPath) {
      pushToast('error', '找不到项目本地路径');
      return;
    }
    setBusy(true);
    try {
      const res = await window.zhuboDesktop.manifest.dedupePortsPreview(proj.localPath);
      if (!res.ok) {
        pushToast('info', res.message);
        setDedupePreview(null);
        return;
      }
      setDedupePreview(res.diffText || null);
    } finally {
      setBusy(false);
    }
  };

  const applyDedupe = async () => {
    const proj = item.projects[0];
    if (!proj?.localPath) return;
    const ok = window.confirm(
      `即将清理「${proj.name}」manifest 中的重复端口。\n\n${dedupePreview || ''}\n\n确认保存？`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await window.zhuboDesktop.manifest.dedupePortsApply(proj.localPath);
      pushToast(res.ok ? 'success' : 'error', res.message);
      if (res.ok) {
        setDedupePreview(null);
        onRefresh();
        pushToast('info', '可到「Git 上传」页提交 manifest 改动');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold">{item.port}</span>
          <Badge variant={TYPE_VARIANT[item.type]}>{TYPE_LABEL[item.type]}</Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={copyDetail} disabled={busy}>
            <Copy className="h-3 w-3" /> 复制
          </Button>
          {item.projects[0]?.id && (
            <Button size="sm" variant="ghost" onClick={openProject} disabled={busy}>
              <FolderOpen className="h-3 w-3" /> 打开项目
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onIgnore(item.id)} disabled={busy}>
            忽略
          </Button>
        </div>
      </div>

      {item.projects.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          涉及项目：{item.projects.map((p) => p.name).join('、')}
        </div>
      )}

      {(item.processName || item.pid) && (
        <div className="mt-1 text-xs text-muted-foreground">
          当前占用：{item.processName || '未知'}
          {item.pid ? ` · PID ${item.pid}` : ''}
        </div>
      )}

      {item.commandLine && (
        <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground/80">
          {item.commandLine.slice(0, 200)}
          {item.commandLine.length > 200 ? '…' : ''}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-foreground/90">{item.suggestion}</p>

      {item.recommendedPorts.length > 0 && item.type === 'config_conflict' && (
        <p className="mt-1 text-xs text-muted-foreground">
          推荐可用端口：{item.recommendedPorts.join('、')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {item.safeToKill && item.pid && (
          <Button size="sm" variant="secondary" onClick={killProcess} disabled={busy}>
            <AlertTriangle className="h-3 w-3" /> 关闭旧进程
          </Button>
        )}
        {item.canDedupeManifest && item.projects[0]?.localPath && (
          <>
            <Button size="sm" variant="secondary" onClick={previewDedupe} disabled={busy}>
              清理重复端口
            </Button>
            {dedupePreview && (
              <Button size="sm" onClick={applyDedupe} disabled={busy}>
                确认保存
              </Button>
            )}
          </>
        )}
      </div>

      {dedupePreview && (
        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 font-mono text-[10px] text-amber-100">
          {dedupePreview}
        </div>
      )}
    </div>
  );
}

export function PortConflictDialog() {
  const open = useAppStore((s) => s.portConflictOpen);
  const setOpen = useAppStore((s) => s.setPortConflictOpen);
  const analysis = useAppStore((s) => s.portConflictAnalysis);
  const setAnalysis = useAppStore((s) => s.setPortConflictAnalysis);
  const ignoredIds = useAppStore((s) => s.portConflictIgnoredIds);
  const ignorePortConflict = useAppStore((s) => s.ignorePortConflict);
  const pushToast = useAppStore((s) => s.pushToast);
  const [scanning, setScanning] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visibleItems = useMemo(() => {
    const list = (analysis?.items || []).filter((i) => !ignoredIds.includes(i.id));
    const rank = (t: PortConflictItem['type']) =>
      t === 'real_occupation' ? 0 : t === 'config_conflict' ? 1 : 2;
    return [...list].sort((a, b) => rank(a.type) - rank(b.type) || a.port - b.port);
  }, [analysis, ignoredIds]);

  const primaryItems = visibleItems.slice(0, 5);
  const restItems = visibleItems.slice(5);

  const rescan = async () => {
    setScanning(true);
    try {
      const result = await window.zhuboDesktop.ports.analyze(ignoredIds);
      setAnalysis(result);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (open && !analysis) void rescan();
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 p-3"
        onClick={() => !scanning && setOpen(false)}
      >
        <motion.aside
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="flex h-[min(88vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="font-semibold">端口冲突处理</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                这些端口可能被多个项目登记，或被旧进程占用。
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭">
              <X className="h-4 w-4" />
            </button>
          </header>

          {analysis && (
            <div className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
              {analysis.healthMessage}
              {analysis.autoFixableCount > 0 && (
                <span className="text-blue-300"> · 可自动处理 {analysis.autoFixableCount} 个</span>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            {visibleItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                暂无需要处理的端口冲突。
              </div>
            ) : (
              <div className="space-y-3">
                {(showAll ? visibleItems : primaryItems).map((item) => (
                  <ConflictRow
                    key={item.id}
                    item={item}
                    onIgnore={ignorePortConflict}
                    onRefresh={rescan}
                  />
                ))}
                {restItems.length > 0 && (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll ? (
                      <>
                        收起 <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        还有 {restItems.length} 条，展开查看 <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <footer className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            <Button size="sm" onClick={rescan} disabled={scanning}>
              <RefreshCw className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? '检测中…' : '重新检测'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const text = visibleItems.map((i) => formatPortConflictCopy(i)).join('\n\n---\n\n');
                navigator.clipboard.writeText(text || '无端口冲突');
                pushToast('success', '已复制全部详情');
              }}
            >
              <Copy className="h-3 w-3" /> 复制详情
            </Button>
          </footer>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}

export function openPortConflictDialog() {
  useAppStore.getState().setPortConflictOpen(true);
}

export type { PortConflictAnalysis };
