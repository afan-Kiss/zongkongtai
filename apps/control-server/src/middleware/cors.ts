import cors from 'cors';
import type { CorsOptions } from 'cors';

const EXACT_ORIGINS = new Set([
  'http://8.137.126.18',
  'http://8.137.126.18/control',
  'http://127.0.0.1:4791',
  'http://localhost:4791',
]);

function isAllowedOrigin(origin: string): boolean {
  if (EXACT_ORIGINS.has(origin)) return true;
  if (/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return true;
  return false;
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (isAllowedOrigin(origin)) {
      return callback(null, origin);
    }
    console.warn(`[CORS] 拒绝来源 Origin=${origin} — 不在白名单内，无法携带 Cookie 调用 API`);
    callback(new Error(`CORS 不允许的来源: ${origin}`));
  },
  credentials: true,
} as CorsOptions);
