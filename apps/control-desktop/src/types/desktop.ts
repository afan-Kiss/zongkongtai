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
  startCommand?: string | null;
  devCommand?: string | null;
  desktopStartCommand?: string | null;
  healthUrl?: string | null;
  localWebUrl?: string | null;
  localHealthUrl?: string | null;
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

export type NavPage =
  | 'overview'
  | 'workspace'
  | 'projects'
  | 'terminal'
  | 'web'
  | 'ports'
  | 'cookies'
  | 'windows'
  | 'settings'
  | 'about';

export interface ProcessInfo {
  projectId: string;
  projectName: string;
  command: string;
  cwd: string;
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  pid?: number;
  startedAt?: string;
  error?: string;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
