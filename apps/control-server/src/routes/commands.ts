import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, getActor, getClientIp } from '../middleware/auth';
import { writeOperationLog } from '../services/operationLog';
import { paramId } from '../lib/params';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const commands = await prisma.commandProfile.findMany({
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(commands);
});

router.post('/', requireAuth, async (req, res) => {
  const command = await prisma.commandProfile.create({ data: req.body });
  await writeOperationLog({
    actor: getActor(req),
    action: 'create_command',
    targetType: 'command',
    targetId: command.id,
    ip: getClientIp(req),
  });
  res.json(command);
});

router.put('/:id', requireAuth, async (req, res) => {
  const command = await prisma.commandProfile.update({ where: { id: paramId(req) }, data: req.body });
  res.json(command);
});

export default router;
