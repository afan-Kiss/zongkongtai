/** 项目管家 — 共享类型 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'protected';

export type GitRepoState =
  'clean' | 'dirty' | 'unpushed' | 'behind' | 'conflict' | 'no_git' | 'no_remote' | 'needs_pull';

export interface GitFileChange {
  path: string;
  status: string;
  blocked?: boolean;
  blockReason?: string;
}

export interface GitProjectStatus {
  projectCode: string;
  projectName: string;
  localPath: string;
  gitRemote?: string;
  branch?: string;
  headCommit?: string;
  headShort?: string;
  state: GitRepoState;
  hasUncommitted: boolean;
  hasUnpushed: boolean;
  isBehindRemote: boolean;
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  ignoredCount: number;
  changes: GitFileChange[];
  safeToCommitPaths: string[];
  blockedPaths: GitFileChange[];
  error?: string;
}

export type HealthItemStatus = 'ok' | 'warn' | 'error' | 'fixable' | 'skipped';

export interface HealthCheckItem {
  id: string;
  title: string;
  status: HealthItemStatus;
  message: string;
  impact?: string;
  repairAction?: string;
  repairable: boolean;
  logHint?: string;
  category: 'cloud' | 'agent' | 'project' | 'git' | 'cookie' | 'infra' | 'config';
}

export interface HealthCheckReport {
  checkedAt: string;
  summary: { ok: number; warn: number; error: number; fixable: number };
  items: HealthCheckItem[];
}

export interface BackupRecord {
  id: string;
  label: string;
  createdAt: string;
  sizeBytes: number;
  path: string;
  kind: 'prod_db' | 'manifest_bundle' | 'pm2_snapshot' | 'health_snapshot';
  restorable: boolean;
  meta?: Record<string, unknown>;
}

export interface DeploymentRecord {
  id: string;
  projectName: string;
  projectCode?: string;
  gitCommit?: string;
  deployedAt: string;
  deployedBy: string;
  deployDir?: string;
  pm2Name?: string;
  healthBefore?: string;
  healthAfter?: string;
  backedUpDb: boolean;
  restartedNginx: boolean;
  restartedXui: boolean;
  restartedAnalysis: boolean;
  restartedControlCenter: boolean;
  result: 'success' | 'failed' | 'partial';
  failureReason?: string;
  rollbackBackupId?: string;
}

export interface StewardTaskItem {
  id: string;
  name: string;
  projectCode?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastResult?: 'ok' | 'failed' | 'skipped';
  durationMs?: number;
  failCount: number;
  lastError?: string;
}

export interface WorkdaySummary {
  startedAt?: string;
  endedAt?: string;
  healthReport?: HealthCheckReport;
  gitUnpushed: GitProjectStatus[];
  backupId?: string;
  notes: string[];
}

export const DEFAULT_RISK_BY_CODE: Record<string, RiskLevel> = {
  'zhubo-control': 'protected',
  'zhubo-analysis': 'high',
  'qianfan-relay': 'high',
  'doudian-bot': 'high',
  'jade-scan': 'medium',
  'jade-accounting': 'medium',
  'xiangyu-system': 'medium',
  'doudian-cdp': 'medium',
  'doudian-gemini': 'medium',
  'churuku-helper': 'low',
  'doudian-chat-export': 'low',
};

export function normalizeRiskLevel(value?: string | null): RiskLevel {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'protected') return v;
  return 'medium';
}

export function riskRequiresConfirm(level: RiskLevel): 'none' | 'medium' | 'high' | 'blocked' {
  if (level === 'protected') return 'blocked';
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'none';
}
