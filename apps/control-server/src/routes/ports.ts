import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, getActor, getClientIp } from '../middleware/auth';
import { requireAgentOrAuth } from '../middleware/agentToken';
import { agentHub } from '../services/agentHub';
import { importScanResults } from '../services/portConflict';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const includeStale = req.query.includeStale === '1';
  const ports = await prisma.portUsage.findMany({
    where: includeStale ? undefined : { runtimeStatus: { not: 'stale' } },
    include: { project: { select: { id: true, name: true, code: true, archived: true } } },
    orderBy: [{ port: 'asc' }, { updatedAt: 'desc' }],
  });
  res.json(ports.filter((p) => !p.project?.archived));
});

router.get('/conflicts', requireAuth, async (_req, res) => {
  const ports = await prisma.portUsage.findMany({
    where: {
      conflictLevel: { in: ['conflict', 'warning'] },
      runtimeStatus: { not: 'stale' },
    },
    include: { project: { select: { id: true, name: true, code: true, archived: true } } },
    orderBy: { port: 'asc' },
  });
  res.json(ports.filter((p) => !p.project?.archived));
});

router.post('/rescan', requireAuth, async (req, res) => {
  try {
    agentHub.requestScan(req.body?.agentId);
    res.json({ ok: true, message: '已通知 Agent 重新扫描' });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : '扫描失败' });
  }
});

router.post('/import', requireAgentOrAuth, async (req, res) => {
  const body = req.body;
  if ((req as { agentId?: string }).agentId) {
    body.agentId = (req as { agentId?: string }).agentId;
  }
  try {
    const stats = await importScanResults(body);
    res.json({ ok: true, stats });
  } catch (e) {
    console.error('[ports/import]', e);
    res.status(500).json({ error: e instanceof Error ? e.message : '扫描入库失败' });
  }
});

export default router;
