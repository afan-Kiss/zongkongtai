import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Boxes,
  FolderKanban,
  TerminalSquare,
  Globe,
  Network,
  Cookie,
  AppWindow,
  Settings,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import type { NavPage } from '@/types/desktop';
import { useEffect, useState } from 'react';

const NAV: { id: NavPage; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'workspace', label: '工作区', icon: Boxes },
  { id: 'projects', label: '项目', icon: FolderKanban },
  { id: 'terminal', label: '终端', icon: TerminalSquare },
  { id: 'web', label: 'Web 页面', icon: Globe },
  { id: 'ports', label: '端口', icon: Network },
  { id: 'cookies', label: 'Cookie', icon: Cookie },
  { id: 'windows', label: '窗口管理', icon: AppWindow },
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
        <div className="text-xs text-muted-foreground">Zhubo Desktop Control</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ id, label, icon: Icon }) => (
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

export function TopBar() {
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const cloudMessage = useAppStore((s) => s.cloudMessage);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const conflictCount = useAppStore((s) => s.conflictCount);
  const warningCount = useAppStore((s) => s.warningCount);
  const runningCount = useAppStore((s) => s.runningCount);
  const qianfanCookieUpdatedAt = useAppStore((s) => s.qianfanCookieUpdatedAt);

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
      title: agentStatus ? `${agentStatus.message}\n连接：${agentStatus.serverUrl}` : undefined,
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

  return (
    <header className="flex h-12 items-center gap-4 border-b border-border px-4 text-xs">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn('flex items-center gap-2', item.warn && !item.ok && 'animate-pulse-soft')}
          title={item.title}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              item.ok ? 'bg-green-400' : item.warn ? 'bg-amber-400 animate-pulse' : 'bg-red-400',
            )}
          />
          <span className="text-muted-foreground">{item.label}</span>
          <span className="max-w-[180px] truncate font-medium" title={item.text}>
            {item.text}
          </span>
        </div>
      ))}
      {warningCount > 0 && <span className="ml-auto text-amber-400">提醒 {warningCount}</span>}
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
