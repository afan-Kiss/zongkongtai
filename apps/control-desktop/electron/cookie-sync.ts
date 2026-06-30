import crypto from 'crypto';
import { loadConfig } from './config';
import { cloudClient } from './cloud-client';
import { loadLocalProjectsFromManifests } from './local-projects';
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
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; service?: string };
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
    return (await res.json()) as {
      lastAutoSyncAt?: string | null;
      autoSyncEnabled?: boolean;
    };
  } catch {
    return null;
  }
}

export async function syncCookieViaRelay(url?: string): Promise<CookieSyncResult> {
  const base = normalizeRelayBase(url);
  const relay = await testQianfanRelay(base);
  if (!relay.ok) {
    return {
      ok: false,
      shops: [],
      message: '同步失败：没有检测到千帆中转机器人，请先打开千帆客服台或启动千帆中转机器人',
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
    fileLog.app(`Cookie 同步 relay success=${data.success ?? 0}/${data.total ?? 0} ok=${data.ok}`);
    return {
      ...data,
      shops: Array.isArray(data.shops) ? data.shops : [],
      relayOnline: true,
      message: data.message || (data.ok ? 'Cookie 已同步' : '同步失败'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fileLog.app(`Cookie 同步失败: ${msg.slice(0, 120)}`, 'error');
    return {
      ok: false,
      shops: [],
      message: '同步失败：没有检测到千帆客服台，请先打开千帆客服台或启动千帆中转机器人',
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
  const cfg = loadConfig();
  const token = cfg.serviceToken?.trim();
  if (!token) {
    return { ok: false, hash8: '', length: 0, message: '未配置 Service Token，无法上传' };
  }
  const normalized = String(cookie || '').trim();
  if (normalized.length < 20) {
    return { ok: false, hash8: '', length: 0, message: 'Cookie 内容太短' };
  }
  const base = cfg.controlServerUrl.replace(/\/$/, '');
  const cookieHash = hashCookie(normalized);
  try {
    const res = await fetch(`${base}/api/secrets/qianfan/upload-cookie`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-service-token': token,
      },
      body: JSON.stringify({
        platform: 'qianfan',
        shopName,
        cookie: normalized,
        cookieHash,
        source: 'manual-paste',
        collectorProject: '本地总控手动上传',
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok) {
      return {
        ok: false,
        hash8: cookieHash.slice(0, 8),
        length: normalized.length,
        message: data.error || `上传失败 ${res.status}`,
      };
    }
    return {
      ok: true,
      hash8: cookieHash.slice(0, 8),
      length: normalized.length,
      message: '上传成功',
    };
  } catch (e) {
    return {
      ok: false,
      hash8: cookieHash.slice(0, 8),
      length: normalized.length,
      message: e instanceof Error ? e.message : '上传失败',
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

export async function isRelayPortOpen(url?: string) {
  const base = normalizeRelayBase(url);
  try {
    const u = new URL(base);
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    return isPortListeningAsync(port, u.hostname || '127.0.0.1');
  } catch {
    return false;
  }
}

export async function qianfanShopsForDesktop(includeArchived = false) {
  try {
    await cloudClient.ensureLogin();
    return cloudClient.qianfanShops(includeArchived);
  } catch {
    const cfg = loadConfig();
    const token = cfg.serviceToken?.trim();
    if (!token) throw new Error('云端未连接');
    return cloudClient.qianfanShopsWithServiceToken(includeArchived);
  }
}
