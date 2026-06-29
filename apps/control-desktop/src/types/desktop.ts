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

export type NavPage =
  | 'overview'
  | 'workspace'
  | 'projects'
  | 'git'
  | 'health'
  | 'backup'
  | 'deploy'
  | 'tasks'
  | 'terminal'
  | 'web'
  | 'ports'
  | 'cookies'
  | 'windows'
  | 'settings'
  | 'about';

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
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  pid?: number;
  startedAt?: string;
  error?: string;
  sessions?: ProcessSession[];
}

export interface AgentStatus {
  state: 'unknown' | 'online' | 'offline' | 'starting' | 'start_failed';
  message: string;
  serverUrl: string;
  wsUrl: string;
  localPid: number | null;
  cloudOnline: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatAgeSec: number | null;
  machineName: string;
  agentName: string;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
