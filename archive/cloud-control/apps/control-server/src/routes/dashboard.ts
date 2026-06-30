import { Router } from 'express';

import { prisma } from '../lib/prisma';

import { requireAuth } from '../middleware/auth';

import { agentHub } from '../services/agentHub';

const router = Router();

router.get('/stats', requireAuth, async (_req, res) => {
  const [
    activeProjectCount,

    runningCount,

    errorCount,

    conflictCount,

    warningCount,

    unknownPortCount,

    expiredSecrets,

    recentOps,

    lastScanOp,
  ] = await Promise.all([
    prisma.project.count({
      where: {
        archived: false,

        OR: [
          { lastScannedAt: { not: null } },
          { locationType: 'cloud', serverPath: { not: null } },
        ],
      },
    }),

    prisma.project.count({ where: { status: 'running', archived: false } }),

    prisma.project.count({ where: { status: 'error', archived: false } }),

    prisma.portUsage
      .groupBy({
        by: ['port'],
        where: { conflictLevel: 'conflict', runtimeStatus: { not: 'stale' } },
      })
      .then((rows) => rows.length),

    prisma.portUsage
      .groupBy({
        by: ['port'],
        where: { conflictLevel: 'warning', runtimeStatus: { not: 'stale' } },
      })
      .then((rows) => rows.length),

    prisma.portUsage.count({
      where: {
        projectId: null,

        sourceType: 'runtime',

        runtimeStatus: 'active',
      },
    }),

    prisma.secretStore.count({ where: { status: 'expired' } }),

    prisma.operationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),

    prisma.operationLog.findFirst({
      where: { action: 'scan_upload' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const agents = await prisma.agent.findMany();

  const onlineIds = new Set(agentHub.getOnlineAgents().map((a) => a.agentId));

  let lastScanAt: string | null = null;

  if (lastScanOp?.detailJson) {
    try {
      const d = JSON.parse(lastScanOp.detailJson);

      lastScanAt = lastScanOp.createdAt.toISOString();
    } catch {
      lastScanAt = lastScanOp.createdAt.toISOString();
    }
  }

  const latestProjectScan = await prisma.project.findFirst({
    where: { lastScannedAt: { not: null }, archived: false },

    orderBy: { lastScannedAt: 'desc' },

    select: { lastScannedAt: true },
  });

  res.json({
    projectCount: activeProjectCount,

    runningCount,

    errorCount,

    conflictCount,

    warningCount,

    unknownPortCount,

    expiredSecrets,

    agentsOnline: agents.filter((a) => onlineIds.has(a.id)).length,

    agentsTotal: agents.length,

    lastScanAt: latestProjectScan?.lastScannedAt?.toISOString() || lastScanAt,

    recentOps,
  });
});

router.get('/health-results/list', requireAuth, async (_req, res) => {
  const results = await prisma.healthCheckResult.findMany({
    include: { project: { select: { id: true, name: true, code: true } } },

    orderBy: { checkedAt: 'desc' },

    take: 100,
  });

  res.json(results);
});

router.get('/operations', requireAuth, async (_req, res) => {
  const logs = await prisma.operationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });

  res.json(logs);
});

export default router;
