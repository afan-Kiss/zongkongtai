import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { BackupRecord, DeploymentRecord } from '@zhubo/control-shared';
import { config } from '../config';
import { writeOperationLog } from './operationLog';

const BACKUP_DIR = process.env.STEWARD_BACKUP_DIR || path.join(process.cwd(), 'backups');
const DEPLOY_DIR = process.env.STEWARD_DEPLOY_DIR || path.join(process.cwd(), 'deploy-records');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function prodDbPath(): string {
  const url = process.env.DATABASE_URL || config.databaseUrl || '';
  const m = url.match(/^file:(.+)$/);
  if (m) {
    const p = m[1];
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  }
  return path.join(process.cwd(), 'prod.db');
}

export function listBackups(): BackupRecord[] {
  ensureDir(BACKUP_DIR);
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      return {
        id: f.replace(/\.db$/, ''),
        label: f,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        path: full,
        kind: 'prod_db' as const,
        restorable: true,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createProdDbBackup(actor: string, label?: string): Promise<BackupRecord> {
  ensureDir(BACKUP_DIR);
  const src = prodDbPath();
  if (!fs.existsSync(src)) throw new Error('生产库不存在，无法备份');

  const id = `${Date.now()}`;
  const filename = label ? `${label}-${id}.db` : `prod-${id}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  fs.copyFileSync(src, dest);

  const stat = fs.statSync(dest);
  const record: BackupRecord = {
    id,
    label: filename,
    createdAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    path: dest,
    kind: 'prod_db',
    restorable: true,
    meta: { source: src },
  };

  await writeOperationLog({
    actor,
    action: 'backup_create',
    targetType: 'database',
    detail: record,
  });

  return record;
}

export async function restoreProdDbBackup(
  backupId: string,
  actor: string,
): Promise<{ ok: boolean; message: string }> {
  const hit = listBackups().find((b) => b.id === backupId || b.label.includes(backupId));
  if (!hit) return { ok: false, message: '备份不存在' };

  const src = prodDbPath();
  const pre = path.join(BACKUP_DIR, `pre-restore-${Date.now()}.db`);
  if (fs.existsSync(src)) fs.copyFileSync(src, pre);
  fs.copyFileSync(hit.path, src);

  try {
    execSync('pm2 restart zhubo-control-center', { stdio: 'pipe', timeout: 30000 });
  } catch {
    /* dev */
  }

  await writeOperationLog({
    actor,
    action: 'backup_restore',
    targetType: 'database',
    detail: { backupId: hit.id, preBackup: pre },
  });

  return { ok: true, message: `已恢复备份 ${hit.label}，仅重启 zhubo-control-center` };
}

export function listDeploymentRecords(): DeploymentRecord[] {
  ensureDir(DEPLOY_DIR);
  const indexFile = path.join(DEPLOY_DIR, 'index.json');
  if (!fs.existsSync(indexFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(indexFile, 'utf8')) as DeploymentRecord[];
  } catch {
    return [];
  }
}

export async function appendDeploymentRecord(
  record: Omit<DeploymentRecord, 'id' | 'deployedAt' | 'deployedBy'>,
  actor: string,
): Promise<DeploymentRecord> {
  ensureDir(DEPLOY_DIR);
  const full: DeploymentRecord = {
    ...record,
    id: `dep-${Date.now()}`,
    deployedAt: new Date().toISOString(),
    deployedBy: actor,
  };
  const list = listDeploymentRecords();
  list.unshift(full);
  fs.writeFileSync(
    path.join(DEPLOY_DIR, 'index.json'),
    JSON.stringify(list.slice(0, 200), null, 2),
  );

  await writeOperationLog({
    actor,
    action: 'deployment',
    targetType: 'project',
    targetId: full.projectCode,
    detail: full,
  });

  return full;
}

export function checkDeployGate(opts: {
  gitPushed?: boolean;
  hasBackup?: boolean;
  willResetToken?: boolean;
  willDbPush?: boolean;
  willRestartNginx?: boolean;
}): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (opts.willResetToken) blockers.push('会重置 Token，禁止');
  if (opts.willDbPush) blockers.push('会执行 db push，需二次确认');
  if (opts.willRestartNginx) blockers.push('会重启 nginx，默认禁止');
  if (!opts.hasBackup) blockers.push('缺少数据库备份');
  if (opts.gitPushed === false) blockers.push('Git 未 push');
  return { ok: blockers.length === 0, blockers };
}
