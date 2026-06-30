import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { QIANFAN_CANONICAL_SHOPS, buildQianfanShopCards } from './qianfan-shops';
import { getConfigDir } from './config';
import { decryptLocalSecret, encryptLocalSecret } from './local-secrets';
import { fileLog } from './file-logger';

export interface LocalCookieRecord {
  shopName: string;
  platform: string;
  source: string;
  cookieHash: string;
  length: number;
  updatedAt: string;
  status: string;
  encryptedValue: string;
}

interface StoreFile {
  version: number;
  shops: Record<string, LocalCookieRecord>;
}

const STORE_FILE = path.join(getConfigDir(), 'cookie-store.json');
const STORE_VERSION = 1;

function hashCookie(cookie: string) {
  return crypto.createHash('sha256').update(cookie, 'utf8').digest('hex');
}

function readStore(): StoreFile {
  try {
    if (!fs.existsSync(STORE_FILE)) return { version: STORE_VERSION, shops: {} };
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as StoreFile;
    if (!raw.shops || typeof raw.shops !== 'object') return { version: STORE_VERSION, shops: {} };
    return raw;
  } catch {
    return { version: STORE_VERSION, shops: {} };
  }
}

function writeStore(store: StoreFile) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export function saveLocalCookie(input: {
  shopName: string;
  platform?: string;
  cookie: string;
  source?: string;
  cookieHash?: string;
}) {
  const shopName = String(input.shopName || '').trim();
  const cookie = String(input.cookie || '').trim();
  if (!shopName || cookie.length < 20) {
    throw new Error('Cookie 无效');
  }
  const enc = encryptLocalSecret(cookie);
  if (!enc) throw new Error('本机无法加密保存 Cookie');
  const cookieHash = String(input.cookieHash || hashCookie(cookie));
  const now = new Date().toISOString();
  const store = readStore();
  store.shops[shopName] = {
    shopName,
    platform: input.platform || 'qianfan',
    source: input.source || '千帆中转机器人',
    cookieHash,
    length: cookie.length,
    updatedAt: now,
    status: 'ok',
    encryptedValue: enc,
  };
  writeStore(store);
  fileLog.app(
    `本地 Cookie 已保存 shop=${shopName} hash=${cookieHash.slice(0, 8)} len=${cookie.length}`,
  );
  return store.shops[shopName];
}

export function resolveLocalCookie(platform: string, shopName: string) {
  const store = readStore();
  const row =
    store.shops[shopName] ||
    Object.values(store.shops).find((s) => s.platform === platform && s.shopName === shopName);
  if (!row) return null;
  const cookie = decryptLocalSecret(row.encryptedValue);
  return {
    ok: true,
    shopName: row.shopName,
    platform: row.platform,
    hash8: row.cookieHash.slice(0, 8),
    length: row.length,
    updatedAt: row.updatedAt,
    source: row.source,
    cookie,
    cookieHash: row.cookieHash,
  };
}

export function listLocalCookieCards(includeArchived = false) {
  const store = readStore();
  const secrets = Object.values(store.shops).map((s) => ({
    platform: s.platform,
    keyName: 'cookie',
    shopName: s.shopName,
    cookieHash: s.cookieHash,
    cookieLength: s.length,
    updatedAt: s.updatedAt,
    lastSeenAt: s.updatedAt,
    lastUploadedBy: s.source,
    collectorSource: s.source,
    status: s.status,
    archived: false,
  }));
  return {
    shops: buildQianfanShopCards(secrets as any[]),
    archived: includeArchived ? [] : [],
  };
}

export function getLocalCookieSummary() {
  const store = readStore();
  let latest: string | null = null;
  for (const row of Object.values(store.shops)) {
    if (!latest || Date.parse(row.updatedAt) > Date.parse(latest)) latest = row.updatedAt;
  }
  const found = QIANFAN_CANONICAL_SHOPS.filter((name) => store.shops[name]).length;
  return { latestUpdatedAt: latest, foundCount: found, total: QIANFAN_CANONICAL_SHOPS.length };
}

export function clearLocalCookieStore() {
  writeStore({ version: STORE_VERSION, shops: {} });
}

export function getLocalCookieStorePath() {
  return STORE_FILE;
}
