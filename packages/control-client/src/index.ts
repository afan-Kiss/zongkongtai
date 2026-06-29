export interface ControlClientOptions {
  baseUrl: string;
  serviceToken: string;
}

export interface GetSecretParams {
  platform: string;
  shopName?: string;
  keyName?: string;
  projectName?: string;
}

export interface QianfanCookieResult {
  value: string;
  updatedAt: string;
  lastUploadedBy?: string | null;
  cookieHash?: string | null;
  staleWarning?: string;
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

function buildAuthHeaders(serviceToken: string, projectName?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceToken}`,
    'x-service-token': serviceToken,
  };
  if (projectName) headers['x-project-name'] = projectName;
  return headers;
}

export class ControlClient {
  constructor(private options: ControlClientOptions) {}

  async getSecret(params: GetSecretParams): Promise<string> {
    const result = await this.resolveSecret(params);
    return result.value;
  }

  async resolveSecret(params: GetSecretParams): Promise<QianfanCookieResult & { ok: boolean }> {
    const q = new URLSearchParams({
      platform: params.platform,
      keyName: params.keyName || 'cookie',
    });
    if (params.shopName) q.set('shopName', params.shopName);

    const res = await fetch(`${normalizeBaseUrl(this.options.baseUrl)}/api/secrets/resolve?${q}`, {
      headers: buildAuthHeaders(this.options.serviceToken, params.projectName),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '获取 Cookie 失败');

    const updatedAt = String(data.updatedAt || '');
    let staleWarning: string | undefined;
    if (updatedAt) {
      const age = Date.now() - Date.parse(updatedAt);
      if (Number.isFinite(age) && age > THREE_HOURS_MS) {
        staleWarning = '千帆 Cookie 超过 3 小时没自动更新，请检查公司电脑千帆客服台是否在线。';
        console.warn(staleWarning);
      }
    }

    return {
      ok: true,
      value: data.value as string,
      updatedAt,
      lastUploadedBy: data.lastUploadedBy,
      cookieHash: data.cookieHash,
      staleWarning,
    };
  }

  async getQianfanCookie(params: {
    shopName: string;
    projectName: string;
    fallbackValue?: string;
  }): Promise<string> {
    try {
      const result = await this.resolveSecret({
        platform: 'qianfan',
        shopName: params.shopName,
        keyName: 'cookie',
        projectName: params.projectName,
      });
      return result.value;
    } catch (err) {
      if (params.fallbackValue) {
        console.warn(
          `[control-client] 总控台读取失败，使用本地 fallback Cookie：${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return params.fallbackValue;
      }
      throw err;
    }
  }
}

export function createControlClient(options: ControlClientOptions) {
  return new ControlClient(options);
}

export function createControlClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = String(env.CONTROL_SERVER_URL || 'http://8.137.126.18/control');
  const serviceToken = String(env.CONTROL_SERVICE_TOKEN || '').trim();
  if (!serviceToken) {
    throw new Error('缺少 CONTROL_SERVICE_TOKEN');
  }
  return createControlClient({ baseUrl, serviceToken });
}
