import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: Number(process.env.PORT || 4790),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  encryptionKey: process.env.SECRET_ENCRYPTION_KEY || '',
  serviceToken: process.env.SERVICE_TOKEN || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'Zhubo@2026!',
  databaseUrl: process.env.DATABASE_URL || `file:${path.join(__dirname, '../prisma/dev.db')}`,
  webDist: path.resolve(__dirname, '../../control-web/dist'),
};
