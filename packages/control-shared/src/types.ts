export type ProjectStatus = 'unknown' | 'running' | 'stopped' | 'error';
export type LocationType = 'cloud' | 'local' | 'mixed';
export type SecretScope = 'global' | 'platform' | 'shop' | 'project';
export type SecretStatus = 'unknown' | 'valid' | 'expired' | 'invalid';
export type CommandType = 'dev' | 'prod' | 'build' | 'deploy' | 'test' | 'worker' | 'custom';
export type ConflictLevel = 'none' | 'warning' | 'conflict';

export interface ScanProjectResult {
  name: string;
  code: string;
  localPath: string;
  category?: string;
  locationType?: LocationType;
  packageManager?: string;
  startCommand?: string;
  devCommand?: string;
  buildCommand?: string;
  desktopStartCommand?: string;
  pm2Name?: string;
  healthUrl?: string;
  localWebUrl?: string;
  localHealthUrl?: string;
  publicUrl?: string;
  internalUrl?: string;
  serverPath?: string;
  branch?: string;
  owner?: string;
  status?: string;
  gitRemote?: string;
  ports: ScanPortResult[];
  commands: ScanCommandResult[];
  notes?: string;
}

export interface ScanPortResult {
  port: number;
  protocol: string;
  host: string;
  sourceFile: string;
  sourceLine: number;
  sourceType: string;
  purpose?: string;
  isRuntimeDetected?: boolean;
}

export interface ScanCommandResult {
  name: string;
  command: string;
  cwd: string;
  type: CommandType;
  source?: 'manifest' | 'scan' | 'manual';
}

export interface AgentScanPayload {
  agentId: string;
  scannedAt: string;
  basePath: string;
  projects: ScanProjectResult[];
  runtimePorts: Array<{ port: number; pid?: number; processName?: string }>;
  unknownPorts: Array<{ port: number; pid?: number; processName?: string }>;
  scanDurationMs?: number;
}

export type AgentMessage =
  | {
      type: 'register';
      name: string;
      machineName: string;
      os: string;
      basePath: string;
      version: string;
    }
  | { type: 'heartbeat' }
  | { type: 'scan_result'; payload: AgentScanPayload }
  | { type: 'command_result'; requestId: string; ok: boolean; message: string; detail?: unknown }
  | { type: 'log_chunk'; projectId: string; chunk: string };

export type ServerAgentMessage =
  | { type: 'registered'; agentId: string }
  | { type: 'ping' }
  | { type: 'request_scan' }
  | {
      type: 'scan_result_ack';
      ok: boolean;
      message: string;
      stats?: {
        projectCount?: number;
        portCount?: number;
        conflictCount?: number;
        warningCount?: number;
      };
    }
  | {
      type: 'run_command';
      requestId: string;
      projectId: string;
      commandId: string;
      command: string;
      cwd: string;
    }
  | { type: 'stop_command'; requestId: string; projectId: string; commandId: string };
