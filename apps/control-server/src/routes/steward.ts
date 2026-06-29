import { Router } from 'express';
import { requireAuth, getActor } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  appendDeploymentRecord,
  checkDeployGate,
  createProdDbBackup,
  listBackups,
  listDeploymentRecords,
  restoreProdDbBackup,
} from '../services/stewardBackup';
import { writeOperationLog } from '../services/operationLog';

const router = Router();

router.get('/git-status', requireAuth, async (_req, res) => {
  const projects = await prisma.project.findMany({
    where: { archived: false },
    orderBy: { name: 'asc' },
    select: {
      code: true,
      name: true,
      localPath: true,
      gitRemote: true,
      branch: true,
      lastScannedAt: true,
    },
  });
  res.json(
    projects.map((p) => ({
      projectCode: p.code,
      projectName: p.name,
      localPath: p.localPath,
      gitRemote: p.gitRemote,
      branch: p.branch,
      lastScannedAt: p.lastScannedAt,
      note: '完整 Git 状态请在本地 EXE「Git 上传」查看',
    })),
  );
});

router.get('/backups', requireAuth, async (_req, res) => {
  res.json(listBackups());
});

router.post('/backups', requireAuth, async (req, res) => {
  try {
    const record = await createProdDbBackup(getActor(req), req.body?.label);
    res.json({ ok: true, record });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : '备份失败' });
  }
});

router.post('/backups/:id/restore', requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const result = await restoreProdDbBackup(id, getActor(req));
  res.status(result.ok ? 200 : 400).json(result);
});

router.get('/deployments', requireAuth, async (_req, res) => {
  res.json(listDeploymentRecords());
});

router.post('/deployments', requireAuth, async (req, res) => {
  const gate = checkDeployGate(req.body?.gate || {});
  if (!gate.ok && !req.body?.force) {
    return res.status(403).json({ error: '部署闸门未通过', blockers: gate.blockers });
  }
  const record = await appendDeploymentRecord(req.body?.record || {}, getActor(req));
  res.json({ ok: true, record });
});

router.post('/deployments/check-gate', requireAuth, async (req, res) => {
  res.json(checkDeployGate(req.body || {}));
});

router.get('/tasks', requireAuth, async (_req, res) => {
  const logs = await prisma.operationLog.findMany({
    where: {
      action: {
        in: [
          'scan_upload',
          'qianfan_cookie_upload',
          'backup_create',
          'workday_start',
          'workday_end',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const tasks = logs.map((l) => {
    let detail: Record<string, unknown> = {};
    try {
      detail = JSON.parse(l.detailJson || '{}');
    } catch {
      /* ignore */
    }
    return {
      id: l.id,
      name: l.action,
      lastRunAt: l.createdAt.toISOString(),
      lastResult: 'ok' as const,
      failCount: 0,
      lastError: detail.error as string | undefined,
      detail,
    };
  });

  res.json(tasks);
});

router.post('/workday/start', requireAuth, async (req, res) => {
  await writeOperationLog({
    actor: getActor(req),
    action: 'workday_start',
    targetType: 'steward',
    detail: req.body || {},
  });
  res.json({ ok: true, message: '今日开工已记录' });
});

router.post('/workday/end', requireAuth, async (req, res) => {
  await writeOperationLog({
    actor: getActor(req),
    action: 'workday_end',
    targetType: 'steward',
    detail: req.body || {},
  });
  res.json({ ok: true, message: '今日收工已记录' });
});

export default router;
