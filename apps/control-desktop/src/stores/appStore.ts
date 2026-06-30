import { create } from 'zustand';
import { deduplicateProjects } from '@/lib/projectDedup';
import type { PortConflictAnalysis } from '@zhubo/control-shared';
import type { AgentStatus, NavPage, ProcessInfo, Project, ToastItem } from '@/types/desktop';

interface AppState {
  page: NavPage;
  setPage: (p: NavPage) => void;
  cloudConnected: boolean;
  cloudMessage: string;
  agentsOnline: number;
  agentStatus: AgentStatus | null;
  conflictCount: number;
  portConflictAnalysis: PortConflictAnalysis | null;
  portConflictOpen: boolean;
  portConflictIgnoredIds: string[];
  warningCount: number;
  runningCount: number;
  projects: Project[];
  projectsRaw: Project[];
  selectedProjectId: string | null;
  processes: Record<string, ProcessInfo>;
  terminalExpanded: boolean;
  terminalFullscreen: boolean;
  activeTerminalId: string | null;
  toasts: ToastItem[];
  showDuplicateProjects: boolean;
  setCloud: (ok: boolean, msg: string, extra?: Partial<AppState>) => void;
  setAgentStatus: (s: AgentStatus | null) => void;
  setProjects: (p: Project[]) => void;
  selectProject: (id: string | null) => void;
  setProcess: (proc: ProcessInfo) => void;
  syncExternalRunning: (rows: ProcessInfo[]) => void;
  setTerminalExpanded: (v: boolean) => void;
  setTerminalFullscreen: (v: boolean) => void;
  setActiveTerminal: (id: string | null) => void;
  pushToast: (type: ToastItem['type'], message: string) => void;
  removeToast: (id: string) => void;
  setShowDuplicateProjects: (v: boolean) => void;
  setPortConflictAnalysis: (a: PortConflictAnalysis | null) => void;
  setPortConflictOpen: (v: boolean) => void;
  ignorePortConflict: (id: string) => void;
}

function countRunning(processes: Record<string, ProcessInfo>) {
  return Object.values(processes).filter(
    (p) => p.status === 'running' || p.status === 'external-running',
  ).length;
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'overview',
  setPage: (page) => set({ page }),
  cloudConnected: false,
  cloudMessage: '尚未连接',
  agentsOnline: 0,
  agentStatus: null,
  conflictCount: 0,
  portConflictAnalysis: null,
  portConflictOpen: false,
  portConflictIgnoredIds: [],
  warningCount: 0,
  runningCount: 0,
  projects: [],
  projectsRaw: [],
  selectedProjectId: null,
  processes: {},
  terminalExpanded: true,
  terminalFullscreen: false,
  activeTerminalId: null,
  toasts: [],
  showDuplicateProjects: false,
  setCloud: (ok, msg, extra) => set({ cloudConnected: ok, cloudMessage: msg, ...extra }),
  setAgentStatus: (agentStatus) =>
    set({
      agentStatus,
      agentsOnline: agentStatus?.cloudOnline ? 1 : 0,
    }),
  setProjects: (projects) => {
    const clean = deduplicateProjects(projects);
    set({ projects: clean, projectsRaw: projects });
  },
  selectProject: (id) => set({ selectedProjectId: id }),
  setProcess: (proc) =>
    set((s) => {
      const processes = { ...s.processes, [proc.projectId]: proc };
      return { processes, runningCount: countRunning(processes) };
    }),
  syncExternalRunning: (rows) =>
    set((s) => {
      const processes = { ...s.processes };
      const detectedIds = new Set(rows.map((r) => r.projectId));
      for (const [id, proc] of Object.entries(processes)) {
        if (proc.status === 'external-running' && !detectedIds.has(id)) {
          delete processes[id];
        }
      }
      for (const row of rows) {
        const existing = processes[row.projectId];
        if (
          existing?.status === 'running' ||
          existing?.status === 'starting' ||
          existing?.status === 'stopping'
        ) {
          continue;
        }
        if (row.status === 'external-running' || row.status === 'running') {
          processes[row.projectId] = row;
        }
      }
      return { processes, runningCount: countRunning(processes) };
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
  setShowDuplicateProjects: (showDuplicateProjects) => set({ showDuplicateProjects }),
  setPortConflictAnalysis: (portConflictAnalysis) =>
    set({
      portConflictAnalysis,
      conflictCount: portConflictAnalysis?.seriousCount ?? 0,
    }),
  setPortConflictOpen: (portConflictOpen) => set({ portConflictOpen }),
  ignorePortConflict: (id) =>
    set((s) => ({
      portConflictIgnoredIds: s.portConflictIgnoredIds.includes(id)
        ? s.portConflictIgnoredIds
        : [...s.portConflictIgnoredIds, id],
    })),
}));
