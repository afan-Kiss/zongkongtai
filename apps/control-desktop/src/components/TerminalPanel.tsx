import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Maximize2, Minimize2, X, Trash2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { TerminalStack } from '@/components/TerminalStack';
import { useAppStore } from '@/stores/appStore';
import '@xterm/xterm/css/xterm.css';

function TermView({ projectId, projectName }: { projectId: string; projectName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e2e8f0',
        cursor: '#818cf8',
        selectionBackground: '#6366f133',
      },
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      scrollback: 1000,
      convertEol: true,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    window.zhuboDesktop.process.logs(projectId).then((logs) => {
      if (logs) term.write(logs.replace(/\n/g, '\r\n') + '\r\n');
    });

    const off = window.zhuboDesktop.terminal.onData(({ projectId: id, data }) => {
      if (id === projectId) term.write(data);
    });

    term.onData((data) => window.zhuboDesktop.terminal.write(projectId, data));

    const ro = new ResizeObserver(() => {
      fit.fit();
      window.zhuboDesktop.terminal.resize(projectId, term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    return () => {
      off();
      ro.disconnect();
      term.dispose();
    };
  }, [projectId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1 text-xs text-muted-foreground">
        <span>{projectName}</span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const term = termRef.current;
              if (term) {
                const sel = term.getSelection();
                if (sel) navigator.clipboard.writeText(sel);
              }
            }}
          >
            复制
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.zhuboDesktop.process.clearLogs(projectId)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}

export function TerminalPanel() {
  const expanded = useAppStore((s) => s.terminalExpanded);
  const fullscreen = useAppStore((s) => s.terminalFullscreen);
  const setExpanded = useAppStore((s) => s.setTerminalExpanded);
  const setFullscreen = useAppStore((s) => s.setTerminalFullscreen);
  const activeId = useAppStore((s) => s.activeTerminalId);
  const setActive = useAppStore((s) => s.setActiveTerminal);
  const projects = useAppStore((s) => s.projects);
  const processes = useAppStore((s) => s.processes);

  const tabs = Object.values(processes).length
    ? Object.values(processes)
    : activeId
      ? [
          {
            projectId: activeId,
            projectName: projects.find((p) => p.id === activeId)?.name || '终端',
            status: 'idle' as const,
            command: '',
            cwd: '',
          },
        ]
      : [];

  const [tabIds, setTabIds] = useState<string[]>([]);
  useEffect(() => {
    const ids = new Set(tabIds);
    for (const p of Object.values(processes)) ids.add(p.projectId);
    if (activeId) ids.add(activeId);
    setTabIds([...ids]);
  }, [processes, activeId]);

  if (!expanded && !fullscreen) {
    return (
      <div className="border-t border-border px-4 py-1">
        <Tooltip content="切换到底部终端">
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(true)}
          >
            展开终端面板
          </button>
        </Tooltip>
      </div>
    );
  }

  const height = fullscreen ? '100vh' : 280;
  const current = activeId || tabIds[0];
  const currentProc = current ? processes[current] : undefined;
  const sessions = currentProc?.sessions || [];
  const activeSessionId = sessions.find((s) => s.type === 'terminal')?.sessionId || null;

  return (
    <motion.div
      layout
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: fullscreen ? '100vh' : height, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={
        fullscreen
          ? 'fixed inset-0 z-[var(--z-terminal)] bg-background'
          : 'border-t border-border overflow-hidden'
      }
    >
      <div className="flex h-full flex-col">
        {sessions.length > 1 && (
          <div className="px-2 pt-2">
            <TerminalStack
              sessions={sessions}
              activeId={activeSessionId}
              onSelect={() => setActive(current!)}
            />
          </div>
        )}
        <div className="flex items-center gap-2 border-b border-border px-2 py-1">
          <div className="flex flex-1 gap-1 overflow-x-auto">
            {tabIds.map((id) => {
              const name = projects.find((p) => p.id === id)?.name || id.slice(0, 8);
              return (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={`rounded px-2 py-1 text-xs ${current === id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <Button size="icon" variant="ghost" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {!fullscreen && (
            <Button size="icon" variant="ghost" onClick={() => setExpanded(false)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current}
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <TermView
                  projectId={current}
                  projectName={projects.find((p) => p.id === current)?.name || '终端'}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!current && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              启动项目后终端会出现在这里
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
