import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    req.session.destroy(() => undefined);
    return res.status(401).json({ error: '登录已失效' });
  }
  next();
}

export function getActor(req: Request): string {
  return req.session.username || 'unknown';
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
