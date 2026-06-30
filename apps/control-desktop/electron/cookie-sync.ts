import crypto from 'crypto';
import { loadConfig } from './config';
import { loadLocalProjectsFromManifests } from './local-projects';
import { getLocalCookieSummary, listLocalCookieCards, saveLocalCookie } from './local-cookie-store';
import { processManager } from './process-manager';
import { pickSafeProjectPayload } from './ipc-security';
import { isPortListeningAsync } from './port-manager';
import { fileLog } from './file-logger';

export interface CookieSyncShopResult {
  shopName: string;
  ok: boolean;
  hash8: string;
  length: number;
  updatedAt: string | null;
  message: string;
  cookie?: string;
}

export interface CookieSyncResult {
  ok: boolean;
  source?: string;
  total?: number;
  success?: number;
  failed?: number;
  shops: CookieSyncShopResult[];
  message: string;
  relayOnline?: boolean;
}

function normalizeRelayBase(url?: string) {
  const cfg = loadConfig();
  return String(url || cfg.qianfanRelayUrl || 'http://127.0.0.1:9323').replace(/\/$/, '');
}

export async function testQianfanRelay(url?: string): Promise<{ ok: boolean; message: string }> {
  const base = normalizeRelayBase(url);
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (res.ok && data.ok !== false) {
      return { ok: true, message: '千帆中转机器人已连接。' };
    }
    return { ok: false, message: '千帆中转机器人未运行。' };
  } catch {
    return { ok: false, message: '千帆中转机器人未运行。' };
  }
}

export async function fetchRelayAutoStatus(url?: string) {
  const base = normalizeRelayBase(url);
  try {
    const res = await fetch(`${base}/api/cookie/status`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()) as { lastAutoSyncAt?: string | null; autoSyncEnabled?: boolean };
  } catch {
    return null;
  }
}

function persistSyncResults(shops: CookieSyncShopResult[]) {
  let saved = 0;
  for (const shop of shops) {
    if (!shop.ok || !shop.cookie || shop.cookie.length < 20) continue;
    try {
      saveLocalCookie({
        shopName: shop.shopName,
        cookie: shop.cookie,
        source: '千帆中转机器人',
        cookieHash: shop.hash8 ? undefined : undefined,
      });
      saved += 1;
    } catch (e) {
      fileLog.app(
        `本地 Cookie 保存失败 shop=${shop.shopName}: ${e instanceof Error ? e.message : String(e)}`,
        'error',
      );
    }
  }
  return saved;
}

export async function syncCookieViaRelay(url?: string): Promise<CookieSyncResult> {
  const base = normalizeRelayBase(url);
  const relay = await testQianfanRelay(base);
  if (!relay.ok) {
    return {
      ok: false,
      shops: [],
      message: '千帆中转机器人未运行，请先启动。',
      relayOnline: false,
    };
  }

  try {
    const res = await fetch(`${base}/api/cookie/sync-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(120000),
    });
    const data = (await res.json().catch(() => ({}))) as CookieSyncResult;
    const shops = Array.isArray(data.shops) ? data.shops : [];
    const saved = persistSyncResults(shops);
    fileLog.app(`Cookie 同步完成 relay=${data.success ?? 0}/${data.total ?? 0} saved=${saved}`);
    return {
      ...data,
      shops: shops.map(({ cookie: _c, ...rest }) => rest),
      relayOnline: true,
      message: data.message || (data.ok ? 'Cookie 已同步' : '同步失败'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fileLog.app(`Cookie 同步失败: ${msg.slice(0, 120)}`, 'error');
    return {
      ok: false,
      shops: [],
      message: '同步失败，请先打开千帆客服台',
      relayOnline: true,
    };
  }
}

function hashCookie(cookie: string) {
  return crypto.createHash('sha256').update(cookie, 'utf8').digest('hex');
}

export async function pasteUploadCookie(
  shopName: string,
  cookie: string,
): Promise<{ ok: boolean; hash8: string; length: number; message: string }> {
  const normalized = String(cookie || '').trim();
  if (normalized.length < 20) {
    return { ok: false, hash8: '', length: 0, message: 'Cookie 内容太短' };
  }
  const cookieHash = hashCookie(normalized);
  try {
    saveLocalCookie({
      shopName,
      cookie: normalized,
      source: '手动粘贴',
      cookieHash,
    });
    return {
      ok: true,
      hash8: cookieHash.slice(0, 8),
      length: normalized.length,
      message: '已保存到本地',
    };
  } catch (e) {
    return {
      ok: false,
      hash8: cookieHash.slice(0, 8),
      length: normalized.length,
      message: e instanceof Error ? e.message : '保存失败',
    };
  }
}

export async function startQianfanRelay(): Promise<{ ok: boolean; message: string }> {
  const projects = loadLocalProjectsFromManifests();
  const relay = projects.find(
    (p) => p.code === 'qianfan-relay' || String(p.name || '').includes('千帆中转'),
  );
  if (!relay?.localPath) {
    return { ok: false, message: '未找到千帆中转机器人项目' };
  }
  const payload = pickSafeProjectPayload(relay as Record<string, unknown>);
  const id = String(payload.id || `local-${payload.code}`);
  const running = processManager.list().some((p) => p.id === id && p.status === 'running');
  if (running) {
    return { ok: true, message: '千帆中转机器人已在运行' };
  }
  await processManager.start(payload);
  return { ok: true, message: '正在启动千帆中转机器人…' };
}

export function qianfanShopsForDesktop(includeArchived = false) {
  return listLocalCookieCards(includeArchived);
}

export function localCookieSummary() {
  const summary = getLocalCookieSummary();
  const cards = listLocalCookieCards();
  const first = cards.shops.find((s) => s.cookieHash);
  return {
    ...summary,
    hash8: first?.cookieHash ? String(first.cookieHash).slice(0, 8) : null,
  };
}
