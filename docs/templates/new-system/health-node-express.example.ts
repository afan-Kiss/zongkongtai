/**
 * Express / Fastify 通用 health 示例（TypeScript）
 * 挂载路径：GET /api/health
 */
import type { Express, Request, Response } from 'express';

const startedAt = Date.now();

export function registerHealthRoute(app: Express, serviceName: string, version = '0.0.0') {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: serviceName,
      version,
      time: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      env: process.env.NODE_ENV || 'development',
    });
  });
}

// 使用：registerHealthRoute(app, '我的项目');
