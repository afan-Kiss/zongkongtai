import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, getActor, getClientIp } from '../middleware/auth';
import { writeOperationLog } from '../services/operationLog';
import { paramId } from '../lib/params';
import { parseCommandInput, parseCommandUpdate, formatZodError } from '../lib/validateInput';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const commands = await prisma.commandProfile.findMany({
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(commands);
});

router.post('/', requireAuth, async (req, res) => {
  let data;
  try {
    data = parseCommandInput(req.body);
  } catch (e) {
    return res.status(400).json({ error: formatZodError(e) });
  }
  const command = await prisma.commandProfile.create({ data });
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
  let data;
  try {
    data = parseCommandUpdate(req.body);
  } catch (e) {
    return res.status(400).json({ error: formatZodError(e) });
  }
  const command = await prisma.commandProfile.update({
    where: { id: paramId(req) },
    data,
  });
  res.json(command);
});

export default router;
