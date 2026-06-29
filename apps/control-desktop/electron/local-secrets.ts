import { safeStorage } from 'electron';

/** Windows DPAPI via Electron safeStorage — reserved for local secrets migration. */

export function isLocalEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function encryptLocalSecret(plain: string): string | null {
  if (!plain || !isLocalEncryptionAvailable()) return null;
  return safeStorage.encryptString(plain).toString('base64');
}

export function decryptLocalSecret(encB64: string): string {
  if (!encB64) return '';
  if (!isLocalEncryptionAvailable()) {
    throw new Error('本机不支持 DPAPI 解密，请重新在设置页填写密钥');
  }
  return safeStorage.decryptString(Buffer.from(encB64, 'base64'));
}
