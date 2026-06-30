import type { ZhuboDesktopApi } from '../../electron/preload';

declare global {
  interface Window {
    zhuboDesktop: ZhuboDesktopApi;
  }
}

export interface Project {
  id: string;
  name: string;
  code: string;
  category?: string;
  localPath?: string | null;
  gitRemote?: string | null;
  riskLevel?: 'low' | 'medium' | 'high' | 'protected';
  startCommand?: string | null;
  devCommand?: string | null;
  desktopStartCommand?: string | null;
  healthUrl?: string | null;
  localWebUrl?: string | null;
  localHealthUrl?: string | null;
  publicUrl?: string | null;
  internalUrl?: string | null;
  status?: string;
  lastScannedAt?: string | null;
  ports?: Array<{
    id: string;
    port: number;
    role?: string;
    conflictLevel?: string;
    conflictReason?: string;
    isRuntimeDetected?: boolean;
  }>;
}

export type DailyNavPage =
  'overview' | 'projects' | 'git' | 'health' | 'terminal' | 'web' | 'settings' | 'about';

/** 旧路由仅用于兼容回退，不出现在主导航 */
export type LegacyNavPage =
  'workspace' | 'backup' | 'deploy' | 'tasks' | 'ports' | 'cookies' | 'windows';

export type NavPage = DailyNavPage | LegacyNavPage;

export interface ProcessSession {
  sessionId: string;
  projectId: string;
  type: 'terminal' | 'web' | 'external-window' | 'service';
  title: string;
  pid?: number;
  command?: string;
  cwd?: string;
  status: string;
  createdAt: string;
}

export interface ProcessInfo {
  projectId: string;
  projectName: string;
  command: string;
  cwd: string;
  status: 'idle' | 'starting' | 'running' | 'external-running' | 'stopping' | 'stopped' | 'error';
  pid?: number;
  startedAt?: string;
  error?: string;
  externalSource?: string;
  canStopExternal?: boolean;
  externalStopHint?: string;
  startupWarning?: string;
  sessions?: ProcessSession[];
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
