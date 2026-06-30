import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  port: Number(process.env.PORT || 4790),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv,
  isProduction,
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  encryptionKey: process.env.SECRET_ENCRYPTION_KEY || '',
  serviceToken: process.env.SERVICE_TOKEN || '',
  agentToken: process.env.AGENT_TOKEN || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || (isProduction ? '' : 'Zhubo@2026!'),
  databaseUrl: process.env.DATABASE_URL || `file:${path.join(__dirname, '../prisma/dev.db')}`,
  webDist: path.resolve(__dirname, '../../control-web/dist'),
};

function failProduction(message: string): never {
  console.error(`\n[总控台启动失败] ${message}\n`);
  process.exit(1);
}

export function validateProductionConfig(): void {
  if (!config.isProduction) return;

  const missing: string[] = [];
  if (!process.env.SESSION_SECRET?.trim()) missing.push('SESSION_SECRET');
  if (!process.env.SECRET_ENCRYPTION_KEY?.trim()) missing.push('SECRET_ENCRYPTION_KEY');
  if (!process.env.SERVICE_TOKEN?.trim()) missing.push('SERVICE_TOKEN');
  if (!process.env.AGENT_TOKEN?.trim()) missing.push('AGENT_TOKEN');
  if (!process.env.ADMIN_PASSWORD?.trim()) missing.push('ADMIN_PASSWORD');

  if (missing.length) {
    failProduction(`生产环境缺少必要配置：${missing.join('、')}。请检查服务器 .env 后重试。`);
  }

  if (config.adminPassword === 'Zhubo@2026!') {
    failProduction('生产环境不允许使用默认 ADMIN_PASSWORD，请设置强密码。');
  }

  let keyBuf: Buffer;
  try {
    keyBuf = Buffer.from(config.encryptionKey, 'base64');
  } catch {
    failProduction(
      '生产环境缺少 SECRET_ENCRYPTION_KEY，总控台拒绝启动，避免 Cookie 无法稳定解密。',
    );
  }
  if (keyBuf.length !== 32) {
    failProduction(
      'SECRET_ENCRYPTION_KEY 必须是 32 字节的 base64 字符串。总控台拒绝启动，避免 Cookie 无法稳定解密。',
    );
  }
}
