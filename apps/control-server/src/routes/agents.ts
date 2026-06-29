import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, getActor, getClientIp } from '../middleware/auth';
import { hashToken } from '../lib/crypto';
import { agentHub } from '../services/agentHub';
import { writeOperationLog } from '../services/operationLog';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const agents = await prisma.agent.findMany({ orderBy: { lastSeenAt: 'desc' } });
  const online = new Set(agentHub.getOnlineAgents().map((a) => a.agentId));
  res.json(
    agents.map((a) => ({
      ...a,
      tokenHash: undefined,
      online: online.has(a.id),
    })),
  );
});

router.post('/register', async (req, res) => {
  const { name, token, machineName, os, basePath, notes } = req.body;
  if (!name || !token) return res.status(400).json({ error: 'name 和 token 必填' });

  const tokenHash = hashToken(token);
  const existing = await prisma.agent.findFirst({ where: { tokenHash } });
  const agent = existing
    ? await prisma.agent.update({
        where: { id: existing.id },
        data: { name, machineName, os, basePath, notes },
      })
    : await prisma.agent.create({
        data: { name, machineName, os, basePath, notes, tokenHash },
      });

  res.json({ ok: true, agentId: agent.id });
});

router.post('/', requireAuth, async (req, res) => {
  const { name, token, machineName, os, basePath, notes } = req.body;
  if (!name || !token) return res.status(400).json({ error: 'name 和 token 必填' });
  const agent = await prisma.agent.create({
    data: {
      name,
      machineName,
      os,
      basePath,
      notes,
      tokenHash: hashToken(token),
    },
  });
  await writeOperationLog({
    actor: getActor(req),
    action: 'create_agent',
    targetType: 'agent',
    targetId: agent.id,
    ip: getClientIp(req),
  });
  res.json({ ...agent, tokenHash: undefined });
});

export default router;
