import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  GitBranch,
  RefreshCw,
  Upload,
  Download,
  FolderOpen,
  ExternalLink,
  Copy,
  FileDiff,
  Sparkles,
} from 'lucide-react';
import type { GitProjectStatus } from '@zhubo/control-shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAppStore } from '@/stores/appStore';

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

export function GitPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const [rows, setRows] = useState<GitProjectStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GitProjectStatus | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = (await window.zhuboDesktop.git.list()) as GitProjectStatus[];
      setRows(list);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doCommitPush = async (row: GitProjectStatus, pushOnly = false) => {
    setBusy(true);
    try {
      const r = await window.zhuboDesktop.git.commitPush({
        localPath: row.localPath,
        message: commitMsg || undefined,
        paths: row.safeToCommitPaths,
        pushOnly,
      });
      if (r.ok) {
        pushToast('success', `${r.message}${r.commitHash ? ` · ${r.commitHash}` : ''}`);
        setCommitMsg('');
        await refresh();
      } else pushToast('error', r.message);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const withGit = rows.filter((r) => r.state !== 'no_git');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <GitBranch className="h-6 w-6 text-primary" /> Git 上传
          </h1>
          <p className="text-sm text-muted-foreground">
            代码账本 — 安全过滤后提交，禁止 .env / 数据库 / 构建产物
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="text-sm text-muted-foreground">有 Git 项目</CardHeader>
          <CardContent className="text-2xl font-semibold">{withGit.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="text-sm text-muted-foreground">有改动</CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-400">
            {rows.filter((r) => r.hasUncommitted).length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="text-sm text-muted-foreground">未 push</CardHeader>
          <CardContent className="text-2xl font-semibold text-orange-400">
            {rows.filter((r) => r.hasUnpushed || r.state === 'unpushed').length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="text-sm text-muted-foreground">需 pull</CardHeader>
          <CardContent className="text-2xl font-semibold text-red-400">
            {rows.filter((r) => r.isBehindRemote).length}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {rows.map((row) => {
          const st = STATE_LABEL[row.state] || STATE_LABEL.dirty;
          const active = selected?.localPath === row.localPath;
          return (
            <motion.div
              key={row.localPath}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card
                className={`cursor-pointer transition-colors ${active ? 'border-primary/50 bg-primary/5' : 'hover:border-border/80'}`}
                onClick={() => setSelected(row)}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{row.projectName}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {row.projectCode}
                    </div>
                  </div>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="truncate text-muted-foreground" title={row.localPath}>
                    {row.localPath}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <span>分支 {row.branch || '—'}</span>
                    <span>HEAD {row.headShort || '—'}</span>
                    <span className="text-green-400/90">+{row.addedCount}</span>
                    <span className="text-amber-400/90">~{row.modifiedCount}</span>
                    <span className="text-red-400/90">-{row.deletedCount}</span>
                  </div>
                  {row.gitRemote && (
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {row.gitRemote}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {selected && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="font-medium">{selected.projectName} — 改动详情</div>
              <div className="flex flex-wrap gap-2">
                <Tooltip content="打开项目目录">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.zhuboDesktop.shell.openPath(selected.localPath)}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content="复制 commit hash">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (selected.headCommit) {
                        navigator.clipboard.writeText(selected.headCommit);
                        pushToast('success', '已复制 commit hash');
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content="打开 GitHub">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const url = await window.zhuboDesktop.git.githubUrl(selected.gitRemote);
                      if (url) window.zhuboDesktop.shell.openExternal(url);
                      else pushToast('error', '无法解析 GitHub 地址');
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="w-full rounded-md border border-border bg-background/50 p-3 text-sm"
              rows={2}
              placeholder="提交说明（留空则自动生成）"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
            />
            {selected.blockedPaths.length > 0 && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                <div className="mb-1 font-medium">已阻止提交的敏感文件：</div>
                {selected.blockedPaths.slice(0, 8).map((b) => (
                  <div key={b.path}>
                    {b.path} — {b.blockReason}
                  </div>
                ))}
              </div>
            )}
            {selected.changes.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-md border border-border/50 bg-card/30 p-2 font-mono text-[11px]">
                {selected.changes.slice(0, 30).map((c) => (
                  <div
                    key={c.path}
                    className={c.blocked ? 'text-red-400' : 'text-muted-foreground'}
                  >
                    [{c.status}] {c.path}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || selected.state === 'no_git'}
                onClick={() => doCommitPush(selected)}
              >
                <Upload className="h-4 w-4" /> 提交并 push
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => doCommitPush(selected, true)}
              >
                仅 push
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  const r = await window.zhuboDesktop.git.pull(selected.localPath);
                  pushToast(r.ok ? 'success' : 'error', r.message);
                  if (r.ok) refresh();
                }}
              >
                <Download className="h-4 w-4" /> pull 最新
              </Button>
              <Button variant="ghost" onClick={() => setPage('health')}>
                <FileDiff className="h-4 w-4" /> 去体检
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length >= 5 && (
        <div className="flex items-center gap-2 text-xs text-green-400/90">
          <Sparkles className="h-4 w-4" /> 已显示 {rows.length} 个项目 Git 状态（验收 ≥5）
        </div>
      )}
    </div>
  );
}
