import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function extractServiceToken(req: Request): string {
  const headerToken = req.headers['x-service-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const queryToken = req.query.serviceToken;
  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();
  return '';
}

export function requireServiceToken(req: Request, res: Response, next: NextFunction) {
  const token = extractServiceToken(req);
  if (!config.serviceToken) {
    return res.status(503).json({ error: '服务端未配置 SERVICE_TOKEN' });
  }
  if (token !== config.serviceToken) {
    return res.status(403).json({ error: '服务令牌无效' });
  }
  next();
}
