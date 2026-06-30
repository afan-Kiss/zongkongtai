import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  Activity,
  TerminalSquare,
  Globe,
  Network,
  Cookie,
  Settings,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import type { NavPage } from '@/types/desktop';
import { useEffect, useMemo, useState } from 'react';
import { findDuplicateGroups } from '@/lib/projectDedup';
import { Button } from '@/components/ui/Button';

/** 左侧主导航 — 简洁版 */
const MAIN_NAV: { id: NavPage; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'projects', label: '项目', icon: FolderKanban },
  { id: 'git', label: 'Git 上传', icon: GitBranch },
  { id: 'health', label: '简单体检', icon: Activity },
  { id: 'terminal', label: '终端', icon: TerminalSquare },
  { id: 'web', label: 'Web 页面', icon: Globe },
  { id: 'ports', label: '端口', icon: Network },
  { id: 'cookies', label: 'Cookie', icon: Cookie },
  { id: 'settings', label: '设置', icon: Settings },
  { id: 'about', label: '关于', icon: Info },
];

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-card/40 p-3">
      <div className="mb-6 px-2">
        <div className="text-lg font-semibold tracking-tight">珠宝本地总控</div>
        <div className="text-xs text-muted-foreground">简洁 · 稳定 · 好用</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {MAIN_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              page === id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      <VersionFooter />
    </aside>
  );
}

function VersionFooter() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    window.zhuboDesktop.app.getVersion().then(setVersion);
  }, []);
  return (
    <div className="mt-auto px-2 pb-1 text-[10px] text-muted-foreground">v{version || '…'}</div>
  );
}

function RemindersPanel({ onClose }: { onClose: () => void }) {
  const projects = useAppStore((s) => s.projects);
  const conflictCount = useAppStore((s) => s.conflictCount);
  const setPage = useAppStore((s) => s.setPage);
  const dupes = useMemo(() => findDuplicateGroups(projects), [projects]);
  const items: string[] = [];
  if (conflictCount > 0) items.push(`端口冲突 ${conflictCount} 个 — 请到「端口」查看`);
  dupes.forEach((d) => items.push(`重复项目：${d}`));
  if (items.length === 0) items.push('暂无待处理提醒');

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
      <div className="mb-2 text-sm font-medium">待处理提醒</div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {items.map((t) => (
          <li key={t}>· {t}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPage('ports');
            onClose();
          }}
        >
          看端口
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </div>
    </div>
  );
}

export function TopBar() {
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const cloudMessage = useAppStore((s) => s.cloudMessage);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const conflictCount = useAppStore((s) => s.conflictCount);
  const warningCount = useAppStore((s) => s.warningCount);
  const runningCount = useAppStore((s) => s.runningCount);
  const qianfanCookieUpdatedAt = useAppStore((s) => s.qianfanCookieUpdatedAt);
  const [showReminders, setShowReminders] = useState(false);

  const agentLabel = (() => {
    if (!agentStatus) return { ok: false, text: '检查中…', warn: false };
    switch (agentStatus.state) {
      case 'online':
        return {
          ok: true,
          text: `在线 · ${agentStatus.lastHeartbeatAgeSec != null ? `${agentStatus.lastHeartbeatAgeSec} 秒前` : '刚刚'}`,
          warn: false,
        };
      case 'starting':
        return { ok: false, text: '正在启动', warn: true };
      case 'start_failed':
        return { ok: false, text: '启动失败', warn: false };
      default:
        return { ok: false, text: agentStatus.message || '离线', warn: false };
    }
  })();

  const items = [
    {
      label: '云端总控',
      ok: cloudConnected,
      text: cloudConnected ? '已连接' : cloudMessage,
      warn: false,
    },
    {
      label: '本地 Agent',
      ok: agentLabel.ok,
      text: agentLabel.text,
      warn: agentLabel.warn,
    },
    {
      label: '千帆 Cookie',
      ok: !!qianfanCookieUpdatedAt && Date.now() - Date.parse(qianfanCookieUpdatedAt) < 3 * 3600000,
      text: qianfanCookieUpdatedAt
        ? `${Math.max(1, Math.floor((Date.now() - Date.parse(qianfanCookieUpdatedAt)) / 60000))} 分钟前`
        : '无记录',
      warn: false,
    },
    {
      label: '端口冲突',
      ok: conflictCount === 0,
      text: `${conflictCount} 个`,
      warn: conflictCount > 0,
    },
    { label: '运行项目', ok: true, text: `${runningCount} 个`, warn: false },
  ];

  const reminderTotal = warningCount + conflictCount;

  return (
    <header className="relative flex h-12 items-center gap-4 border-b border-border px-4 text-xs">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn('flex items-center gap-2', item.warn && !item.ok && 'animate-pulse-soft')}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              item.ok ? 'bg-green-400' : item.warn ? 'animate-pulse bg-amber-400' : 'bg-red-400',
            )}
          />
          <span className="text-muted-foreground">{item.label}</span>
          <span className="max-w-[180px] truncate font-medium">{item.text}</span>
        </div>
      ))}
      {reminderTotal > 0 && (
        <div className="relative ml-auto">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-amber-400 transition-colors hover:bg-amber-500/10"
            onClick={() => setShowReminders((v) => !v)}
          >
            有 {reminderTotal} 条待处理提醒
          </button>
          {showReminders && <RemindersPanel onClose={() => setShowReminders(false)} />}
        </div>
      )}
    </header>
  );
}

export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20 }}
            className={cn(
              'pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-card',
              t.type === 'success' && 'border-green-500/30 bg-green-500/10',
              t.type === 'error' && 'border-red-500/30 bg-red-500/10',
              t.type === 'info' && 'border-border bg-card',
            )}
            onClick={() => removeToast(t.id)}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
