import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  Activity,
  TerminalSquare,
  Globe,
  Cookie,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { cloudBarText, cloudHintMessage, cookieBarState } from '@/lib/cloudStatus';
import { useAppStore } from '@/stores/appStore';
import type { NavPage } from '@/types/desktop';
import { useEffect, useState } from 'react';

/** 左侧主导航 — 极简 8 项（端口/关于等进设置） */
const MAIN_NAV: { id: NavPage; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'projects', label: '项目', icon: FolderKanban },
  { id: 'git', label: 'Git 上传', icon: GitBranch },
  { id: 'health', label: '简单体检', icon: Activity },
  { id: 'terminal', label: '终端', icon: TerminalSquare },
  { id: 'web', label: 'Web 页面', icon: Globe },
  { id: 'cookies', label: 'Cookie', icon: Cookie },
  { id: 'settings', label: '设置', icon: Settings },
];

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);

  return (
    <aside className="flex w-52 flex-col border-r border-border bg-card/40 p-3">
      <div className="mb-5 px-2">
        <div className="text-lg font-semibold tracking-tight">珠宝本地总控</div>
        <div className="text-xs text-muted-foreground">简洁 · 稳定 · 好用</div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {MAIN_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setPage(id)}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              page === id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
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

export function TopBar() {
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const portAnalysis = useAppStore((s) => s.portConflictAnalysis);
  const setPortConflictOpen = useAppStore((s) => s.setPortConflictOpen);
  const runningCount = useAppStore((s) => s.runningCount);
  const qianfanCookieUpdatedAt = useAppStore((s) => s.qianfanCookieUpdatedAt);
  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);

  const portLabel = portAnalysis?.topBarLabel || '端口';
  const portText = portAnalysis?.topBarText || '正常';
  const portOk = portAnalysis?.topBarOk ?? true;
  const portClickable = portAnalysis?.topBarClickable ?? false;
  const portWarn = !portOk || (portAnalysis?.duplicateCount ?? 0) > 0;

  const cookie = cookieBarState(cloudConnected, qianfanCookieUpdatedAt);

  const items: Array<{
    label: string;
    ok: boolean;
    text: string;
    warn?: boolean;
    clickable?: boolean;
    onClick?: () => void;
  }> = [
    { label: '本地模式', ok: true, text: '正常' },
    {
      label: '云端',
      ok: cloudConnected,
      text: cloudBarText(cloudConnected),
      warn: !cloudConnected,
      clickable: !cloudConnected,
      onClick: !cloudConnected ? () => pushToast('info', cloudHintMessage()) : undefined,
    },
    {
      label: 'Cookie',
      ok: cookie.ok,
      text: cookie.text,
      warn: cookie.warn,
      clickable: !cloudConnected,
      onClick: !cloudConnected ? () => setPage('settings') : undefined,
    },
    {
      label: portLabel,
      ok: portOk,
      text: portText,
      warn: portWarn,
      clickable: portClickable,
      onClick: portClickable ? () => setPortConflictOpen(true) : undefined,
    },
    { label: '运行', ok: true, text: `${runningCount}个` },
  ];

  return (
    <header className="flex h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 text-xs">
      {items.map((item) => {
        const inner = (
          <>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                item.ok ? 'bg-green-400' : item.warn ? 'bg-amber-400' : 'bg-red-400',
              )}
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="max-w-[180px] truncate font-medium">{item.text}</span>
          </>
        );
        return item.clickable ? (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={cn(
              'flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-accent/60',
              item.warn && !item.ok && 'text-amber-400',
            )}
          >
            {inner}
          </button>
        ) : (
          <div
            key={item.label}
            className={cn('flex items-center gap-1.5', item.warn && !item.ok && 'text-amber-400')}
          >
            {inner}
          </div>
        );
      })}
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              'pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-card',
              t.type === 'success' && 'border-green-500/30 bg-green-500/10 text-green-100',
              t.type === 'error' && 'border-red-500/30 bg-red-500/10 text-red-100',
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
