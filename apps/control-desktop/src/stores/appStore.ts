import { create } from 'zustand';
import type { AgentStatus, NavPage, ProcessInfo, Project, ToastItem } from '@/types/desktop';

interface AppState {
  page: NavPage;
  setPage: (p: NavPage) => void;
  cloudConnected: boolean;
  cloudMessage: string;
  agentsOnline: number;
  agentStatus: AgentStatus | null;
  conflictCount: number;
  warningCount: number;
  runningCount: number;
  projects: Project[];
  selectedProjectId: string | null;
  processes: Record<string, ProcessInfo>;
  terminalExpanded: boolean;
  terminalFullscreen: boolean;
  activeTerminalId: string | null;
  toasts: ToastItem[];
  qianfanCookieUpdatedAt: string | null;
  qianfanCookieHash: string | null;
  showDuplicateProjects: boolean;
  setCloud: (ok: boolean, msg: string, extra?: Partial<AppState>) => void;
  setAgentStatus: (s: AgentStatus | null) => void;
  setProjects: (p: Project[]) => void;
  selectProject: (id: string | null) => void;
  setProcess: (proc: ProcessInfo) => void;
  setTerminalExpanded: (v: boolean) => void;
  setTerminalFullscreen: (v: boolean) => void;
  setActiveTerminal: (id: string | null) => void;
  pushToast: (type: ToastItem['type'], message: string) => void;
  removeToast: (id: string) => void;
  setQianfanCookie: (updatedAt: string | null, hash: string | null) => void;
  setShowDuplicateProjects: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'overview',
  setPage: (page) => set({ page }),
  cloudConnected: false,
  cloudMessage: '尚未连接',
  agentsOnline: 0,
  agentStatus: null,
  conflictCount: 0,
  warningCount: 0,
  runningCount: 0,
  projects: [],
  selectedProjectId: null,
  processes: {},
  terminalExpanded: true,
  terminalFullscreen: false,
  activeTerminalId: null,
  toasts: [],
  qianfanCookieUpdatedAt: null,
  qianfanCookieHash: null,
  showDuplicateProjects: false,
  setCloud: (ok, msg, extra) => set({ cloudConnected: ok, cloudMessage: msg, ...extra }),
  setAgentStatus: (agentStatus) =>
    set({
      agentStatus,
      agentsOnline: agentStatus?.cloudOnline ? 1 : 0,
    }),
  setProjects: (projects) => set({ projects }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setProcess: (proc) =>
    set((s) => {
      const processes = { ...s.processes, [proc.projectId]: proc };
      const runningCount = Object.values(processes).filter((p) => p.status === 'running').length;
      return { processes, runningCount };
    }),
  setTerminalExpanded: (terminalExpanded) => set({ terminalExpanded }),
  setTerminalFullscreen: (terminalFullscreen) => set({ terminalFullscreen }),
  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId, terminalExpanded: true }),
  pushToast: (type, message) => {
    const id = `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => get().removeToast(id), 4500);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setQianfanCookie: (updatedAt, hash) =>
    set({ qianfanCookieUpdatedAt: updatedAt, qianfanCookieHash: hash }),
  setShowDuplicateProjects: (showDuplicateProjects) => set({ showDuplicateProjects }),
}));
