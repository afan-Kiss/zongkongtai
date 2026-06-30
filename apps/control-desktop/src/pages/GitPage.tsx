import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  RefreshCw,
  Upload,
  Download,
  FolderOpen,
  ExternalLink,
  FileDiff,
  X,
} from 'lucide-react';
import type { GitProjectStatus } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { SkeletonRow } from '@/components/TaskProgressPanel';
import { useAppStore } from '@/stores/appStore';
import { useTaskRunner } from '@/hooks/useTaskRunner';

const STATE_LABEL: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }
> = {
  clean: { label: '干净', variant: 'success' },
  dirty: { label: '有改动', variant: 'warning' },
  unpushed: { label: '未 push', variant: 'warning' },
  behind: { label: '需 pull', variant: 'warning' },
  needs_pull: { label: '需 pull', variant: 'warning' },
  conflict: { label: '冲突', variant: 'destructive' },
  no_git: { label: '无 Git', variant: 'muted' },
  no_remote: { label: '无远端', variant: 'muted' },
};

function defaultCommitMessage(row: GitProjectStatus): string {
  if (row.state === 'dirty' || row.hasUncommitted) return 'fix: update project changes';
  if (row.hasUnpushed || row.state === 'unpushed') return 'chore: sync local changes';
  return 'chore: update control integration';
}

export function GitPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const [rows, setRows] = useState<GitProjectStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<GitProjectStatus | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const { runTask } = useTaskRunner();

  useEffect(() => {
    const off = window.zhuboDesktop.tasks.onProgress((task) => {
      const partial = (task as { partial?: { results?: GitProjectStatus[] } }).partial?.results;
      if (partial?.length) setRows([...partial]);
    });
    return off;
  }, []);

  const refresh = useCallback(
    async (fetchRemote = false) => {
      if (loading) {
        pushToast('info', '正在扫描 Git 状态，请稍等');
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const results = (await runTask(() =>
          window.zhuboDesktop.git.list({ fetchRemote }),
        )) as GitProjectStatus[];
        if (!Array.isArray(results)) throw new Error('Git 列表格式异常，请重试');
        setRows(results);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        pushToast('error', msg);
      } finally {
        setLoading(false);
      }
    },
    [loading, pushToast, runTask],
  );

  useEffect(() => {
    void refresh(false);
  }, []);

  const openUpload = (row: GitProjectStatus, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (row.state === 'no_git') {
      pushToast('error', '这个项目没有 Git 仓库');
      return;
    }
    setUploadTarget(row);
    setCommitMsg(defaultCommitMessage(row));
  };

  const doCommitPush = async (row: GitProjectStatus, pushOnly = false) => {
    if (busy) {
      pushToast('info', 'Git 操作进行中，请稍等');
      return;
    }
    setBusy(true);
    try {
      const r = (await runTask(() =>
        window.zhuboDesktop.git.commitPush({
          localPath: row.localPath,
          message: commitMsg || defaultCommitMessage(row),
          paths: row.safeToCommitPaths,
          pushOnly,
        }),
      )) as { ok: boolean; message: string; commitHash?: string };
      if (r.ok) {
        pushToast(
          'success',
          `已上传到 GitHub${r.commitHash ? `：commit ${r.commitHash.slice(0, 7)}` : ''}`,
        );
        setUploadTarget(null);
        setCommitMsg('');
        await refresh(false);
      } else {
        pushToast('error', r.message || '上传失败');
      }
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const withGit = rows.filter((r) => r.state !== 'no_git');
  const changeCount = (r: GitProjectStatus) =>
    r.addedCount + r.modifiedCount + r.deletedCount + (r.hasUncommitted ? 1 : 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <GitBranch className="h-6 w-6 text-primary" /> Git 上传
          </h1>
          <p className="text-sm text-muted-foreground">每个项目卡片上直接「一键上传」到 GitHub</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refresh(false)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
          <Button variant="ghost" onClick={() => setPage('health')}>
            检查未上传项目
          </Button>
        </div>
      </div>

      {loadError && rows.length === 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-4 text-sm">
            <p className="text-red-300">加载失败：{loadError}</p>
            <Button size="sm" className="mt-2" onClick={() => refresh(false)}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {loading && rows.length === 0 && (
          <>
            <SkeletonRow />
            <SkeletonRow />
          </>
        )}
        {rows.map((row) => {
          const st = STATE_LABEL[row.state] || STATE_LABEL.dirty;
          return (
            <motion.div
              key={row.localPath}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card className="transition-colors hover:border-primary/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.08)]">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{row.projectName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      分支 {row.branch || '—'} · 改动 {changeCount(row)} 个
                    </div>
                  </div>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {row.gitRemote && (
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {row.gitRemote}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      disabled={busy || row.state === 'no_git'}
                      onClick={(e) => openUpload(row, e)}
                    >
                      <Upload className="h-3 w-3" /> 一键上传
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || row.state === 'no_git'}
                      onClick={() => doCommitPush(row, true)}
                    >
                      仅 push
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openUpload(row)}>
                      <FileDiff className="h-3 w-3" /> 查看改动
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const url = await window.zhuboDesktop.git.githubUrl(row.gitRemote);
                        if (url) await window.zhuboDesktop.shell.openGithub(url);
                        else pushToast('error', '无法打开 GitHub');
                      }}
                    >
                      <ExternalLink className="h-3 w-3" /> GitHub
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.zhuboDesktop.shell.openPath(row.localPath)}
                    >
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {uploadTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => !busy && setUploadTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96 }}
              className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">一键上传 — {uploadTarget.projectName}</h3>
                <button type="button" onClick={() => setUploadTarget(null)} aria-label="关闭">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <textarea
                className="mb-3 w-full rounded-md border border-border bg-background/50 p-3 text-sm"
                rows={2}
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="提交说明"
              />
              {uploadTarget.blockedPaths.length > 0 && (
                <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
                  <div className="font-medium">已拦截的敏感文件：</div>
                  {uploadTarget.blockedPaths.slice(0, 6).map((b) => (
                    <div key={b.path}>
                      {b.path} — {b.blockReason}
                    </div>
                  ))}
                </div>
              )}
              {uploadTarget.changes.length > 0 ? (
                <div className="mb-4 max-h-40 overflow-auto rounded-md border border-border/50 bg-card/30 p-2 font-mono text-[11px]">
                  {uploadTarget.changes.slice(0, 40).map((c) => (
                    <div
                      key={c.path}
                      className={c.blocked ? 'text-red-400' : 'text-muted-foreground'}
                    >
                      [{c.status}] {c.path}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-4 text-sm text-muted-foreground">
                  没有可提交的改动，或需要先 pull。
                </p>
              )}
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => doCommitPush(uploadTarget)}>
                  <Upload className="h-4 w-4" /> 确认上传
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => doCommitPush(uploadTarget, true)}
                >
                  仅 push
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = (await runTask(() =>
                        window.zhuboDesktop.git.pull(uploadTarget.localPath),
                      )) as { ok: boolean; message: string };
                      pushToast(r.ok ? 'success' : 'error', r.message);
                      if (r.ok) await refresh(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Download className="h-4 w-4" /> pull
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {withGit.length === 0 && !loading && !loadError && (
        <p className="text-sm text-muted-foreground">未发现 Git 项目，请确认扫描根目录是否正确。</p>
      )}
    </div>
  );
}
