/** 本地总控前端状态 — 无 cloud / agent / Cookie 字段 */
import { create } from 'zustand';
import { deduplicateProjects } from '@/lib/projectDedup';
import type { PortConflictAnalysis } from '@zhubo/control-shared';
import type { NavPage, ProcessInfo, Project, ToastItem } from '@/types/desktop';
import {
  EMPTY_GIT_SUMMARY,
  type GitSummary,
  saveGitSummaryToStorage,
  loadGitSummaryFromStorage,
} from '@/lib/gitSummary';

interface AppState {
  page: NavPage;
  setPage: (p: NavPage) => void;
  portConflictAnalysis: PortConflictAnalysis | null;
  portConflictOpen: boolean;
  portConflictIgnoredIds: string[];
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
  gitSummary: GitSummary;
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
  setGitSummary: (summary: Partial<GitSummary>) => void;
  clearGitSummary: () => void;
  refreshGitSummary: (fetchRemote?: boolean) => Promise<GitSummary>;
}

function countRunning(processes: Record<string, ProcessInfo>) {
  return Object.values(processes).filter(
    (p) => p.status === 'running' || p.status === 'external-running',
  ).length;
}

let gitRefreshPromise: Promise<GitSummary> | null = null;

function summarizeGitRows(
  rows: Array<{ hasUnpushed?: boolean; hasUncommitted?: boolean; state?: string }>,
) {
  const unpushed = rows.filter(
    (r) =>
      r.hasUnpushed ||
      r.state === 'unpushed' ||
      r.state === 'dirty' ||
      r.state === 'behind' ||
      r.state === 'needs_pull',
  ).length;
  const dirty = rows.filter((r) => r.hasUncommitted || r.state === 'dirty').length;
  return { unpushed, dirty, total: rows.length };
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'overview',
  setPage: (page) => set({ page }),
  portConflictAnalysis: null,
  portConflictOpen: false,
  portConflictIgnoredIds: [],
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
  gitSummary: loadGitSummaryFromStorage() ?? EMPTY_GIT_SUMMARY,
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
  setPortConflictAnalysis: (portConflictAnalysis) => set({ portConflictAnalysis }),
  setPortConflictOpen: (portConflictOpen) => set({ portConflictOpen }),
  ignorePortConflict: (id) =>
    set((s) => ({
      portConflictIgnoredIds: s.portConflictIgnoredIds.includes(id)
        ? s.portConflictIgnoredIds
        : [...s.portConflictIgnoredIds, id],
    })),
  setGitSummary: (partial) =>
    set((s) => {
      const gitSummary = { ...s.gitSummary, ...partial };
      saveGitSummaryToStorage(gitSummary);
      return { gitSummary };
    }),
  clearGitSummary: () => {
    saveGitSummaryToStorage(EMPTY_GIT_SUMMARY);
    set({ gitSummary: { ...EMPTY_GIT_SUMMARY } });
  },
  refreshGitSummary: async (fetchRemote = false) => {
    if (gitRefreshPromise) return gitRefreshPromise;
    set((s) => ({ gitSummary: { ...s.gitSummary, checking: true } }));
    gitRefreshPromise = (async () => {
      try {
        const rows = (await window.zhuboDesktop.git.list({ fetchRemote })) as Array<{
          hasUnpushed?: boolean;
          hasUncommitted?: boolean;
          state?: string;
        }>;
        const { unpushed, dirty, total } = summarizeGitRows(rows);
        const gitSummary: GitSummary = {
          checkedAt: new Date().toISOString(),
          unpushedCount: unpushed,
          dirtyCount: dirty,
          total,
          checking: false,
        };
        saveGitSummaryToStorage(gitSummary);
        set({ gitSummary });
        return gitSummary;
      } catch {
        const gitSummary: GitSummary = {
          ...(get().gitSummary.checkedAt ? get().gitSummary : EMPTY_GIT_SUMMARY),
          checking: false,
        };
        set({ gitSummary });
        return gitSummary;
      } finally {
        gitRefreshPromise = null;
      }
    })();
    return gitRefreshPromise;
  },
}));
