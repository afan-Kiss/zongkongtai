import { BrowserWindow, session } from 'electron';
import { loadConfig } from './config';

let sessionCookie = '';

export function getSessionCookie() {
  return sessionCookie;
}

export function setSessionCookie(cookie: string) {
  sessionCookie = cookie;
}

function normalizeUrl(base: string) {
  return base.replace(/\/$/, '');
}

export class CloudClient {
  private baseUrl: string;
  private cookie = '';

  constructor() {
    this.baseUrl = normalizeUrl(loadConfig().controlServerUrl);
  }

  refreshConfig() {
    this.baseUrl = normalizeUrl(loadConfig().controlServerUrl);
  }

  private async request<T>(pathname: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.cookie) headers.Cookie = this.cookie;

    const res = await fetch(`${this.baseUrl}${pathname}`, { ...options, headers });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookie = setCookie
        .split(',')
        .map((s) => s.split(';')[0].trim())
        .join('; ');
      setSessionCookie(this.cookie);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: string }).error || `请求失败 ${res.status}`;
      throw new Error(msg);
    }
    return data as T;
  }

  async health(): Promise<{ ok: boolean; service?: string }> {
    return this.request('/api/health');
  }

  async login(username: string, password: string) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async me() {
    return this.request<{ id: string; username: string }>('/api/auth/me');
  }

  async projects() {
    return this.request<any[]>('/api/projects');
  }

  async project(id: string) {
    return this.request<any>(`/api/projects/${id}`);
  }

  async ports() {
    return this.request<any[]>('/api/ports');
  }

  async portConflicts() {
    return this.request<any[]>('/api/ports/conflicts');
  }

  async agents() {
    return this.request<any[]>('/api/agents');
  }

  async dashboard() {
    return this.request<any>('/api/dashboard/stats');
  }

  async secrets() {
    return this.request<any[]>('/api/secrets');
  }

  async qianfanShops(includeArchived = false) {
    const qs = includeArchived ? '?includeArchived=1' : '';
    return this.request<{ shops: any[]; archived: any[] }>(`/api/secrets/qianfan/shops${qs}`);
  }

  async operations() {
    return this.request<any[]>('/api/dashboard/operations');
  }

  async healthCheck(url: string) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, message: (body as { message?: string }).message };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async stewardBackups() {
    return this.request<any[]>('/api/steward/backups');
  }

  async stewardCreateBackup(label?: string) {
    return this.request<{ ok: boolean; record: unknown }>('/api/steward/backups', {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  }

  async stewardRestoreBackup(id: string) {
    return this.request<{ ok: boolean; message: string }>(`/api/steward/backups/${id}/restore`, {
      method: 'POST',
    });
  }

  async stewardDeployments() {
    return this.request<any[]>('/api/steward/deployments');
  }

  async stewardTasks() {
    return this.request<any[]>('/api/steward/tasks');
  }

  async importManifests(manifests: unknown[]) {
    return this.request<{
      ok: boolean;
      imported: number;
      updated: number;
      skipped: number;
      warnings: string[];
      codes: string[];
    }>('/api/projects/import-manifests', {
      method: 'POST',
      body: JSON.stringify({ manifests }),
    });
  }

  async requestRescan(agentId?: string) {
    return this.request<{ ok: boolean; message: string }>('/api/ports/rescan', {
      method: 'POST',
      body: JSON.stringify(agentId ? { agentId } : {}),
    });
  }

  async ensureLogin(): Promise<void> {
    try {
      await this.me();
      return;
    } catch {
      const cfg = loadConfig();
      if (!cfg.adminPassword) throw new Error('未配置管理员密码，请在设置页填写');
      await this.login(cfg.adminUsername, cfg.adminPassword);
    }
  }
}

export const cloudClient = new CloudClient();

export function setupCloudWebRequest(mainWindow: BrowserWindow) {
  const cfg = loadConfig();
  const filter = { urls: [`${normalizeUrl(cfg.controlServerUrl)}/*`] };
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (sessionCookie) {
      details.requestHeaders.Cookie = sessionCookie;
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}
