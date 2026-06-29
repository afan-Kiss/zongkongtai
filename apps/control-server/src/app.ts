import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { corsMiddleware } from './middleware/cors';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import portRoutes from './routes/ports';
import secretRoutes from './routes/secrets';
import commandRoutes from './routes/commands';
import agentRoutes from './routes/agents';
import dashboardRoutes from './routes/dashboard';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(corsMiddleware);

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.message?.includes('CORS')) {
      console.warn(`[CORS] ${req.method} ${req.path} — ${err.message}`);
      return res.status(403).json({ error: err.message });
    }
    next(err);
  });
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'zhubo-control-center', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/ports', portRoutes);
  app.use('/api/secrets', secretRoutes);
  app.use('/api/commands', commandRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  const webDist = config.webDist;
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  return app;
}
