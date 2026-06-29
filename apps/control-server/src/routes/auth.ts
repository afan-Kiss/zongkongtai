import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth, getActor, getClientIp } from '../middleware/auth';
import { writeOperationLog } from '../services/operationLog';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  await writeOperationLog({
    actor: user.username,
    action: 'login',
    ip: getClientIp(req),
  });
  res.json({ ok: true, user: { id: user.id, username: user.username } });
});

router.post('/logout', requireAuth, async (req, res) => {
  const actor = getActor(req);
  req.session.destroy(() => undefined);
  await writeOperationLog({ actor, action: 'logout', ip: getClientIp(req) });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ id: req.session.userId, username: req.session.username });
});

export default router;
