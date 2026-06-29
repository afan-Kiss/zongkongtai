import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { hashToken } from '../lib/crypto';
import { prisma } from '../lib/prisma';

export async function requireAgentOrAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-agent-token'] as string | undefined;
  if (token) {
    const tokenHash = hashToken(token);
    const agent = await prisma.agent.findFirst({ where: { tokenHash } });
    if (agent) {
      (req as Request & { agentId?: string }).agentId = agent.id;
      return next();
    }
  }
  if (!req.session?.userId) {
    return res.status(401).json({ error: '需要登录或 Agent 令牌' });
  }
  next();
}

export async function requireAgentToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-agent-token'] as string | undefined;
  if (!token) return res.status(401).json({ error: '缺少 Agent 令牌' });
  const tokenHash = hashToken(token);
  const agent = await prisma.agent.findFirst({ where: { tokenHash } });
  if (!agent) return res.status(403).json({ error: 'Agent 令牌无效' });
  (req as Request & { agentId?: string }).agentId = agent.id;
  next();
}
