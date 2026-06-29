import crypto from 'crypto';
import { maskSecret } from '@zhubo/control-shared';
import { config } from '../config';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  if (config.encryptionKey) {
    const buf = Buffer.from(config.encryptionKey, 'base64');
    if (buf.length === 32) return buf;
  }
  return crypto.createHash('sha256').update(config.sessionSecret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function previewSecret(plain: string): string {
  return maskSecret(plain);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
