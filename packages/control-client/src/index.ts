export interface LocalControlClientOptions {
  baseUrl?: string;
}

export interface QianfanCookieResult {
  value: string;
  updatedAt: string;
  cookieHash?: string | null;
  staleWarning?: string;
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:4793';

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

/** @deprecated 云端 SecretStore 已弃用，请使用 createLocalControlClient */
export class ControlClient {
  constructor(private options: { baseUrl: string; serviceToken: string }) {}

  async getQianfanCookie(params: {
    shopName: string;
    projectName?: string;
    fallbackValue?: string;
  }): Promise<string> {
    try {
      const local = createLocalControlClient({ baseUrl: process.env.LOCAL_CONTROL_URL });
      return await local.getQianfanCookie(params);
    } catch (err) {
      if (params.fallbackValue) return params.fallbackValue;
      throw err;
    }
  }
}

export function createLocalControlClient(options: LocalControlClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl || process.env.LOCAL_CONTROL_URL || DEFAULT_LOCAL_URL,
  );

  return {
    async resolveQianfanCookie(shopName: string): Promise<QianfanCookieResult & { ok: boolean }> {
      const q = new URLSearchParams({ platform: 'qianfan', shopName });
      const res = await fetch(`${baseUrl}/api/local-cookies/resolve?${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '本地 Cookie 读取失败');
      const updatedAt = String((data as { updatedAt?: string }).updatedAt || '');
      let staleWarning: string | undefined;
      if (updatedAt) {
        const age = Date.now() - Date.parse(updatedAt);
        if (Number.isFinite(age) && age > THREE_HOURS_MS) {
          staleWarning = '千帆 Cookie 超过 3 小时没更新，请点立即同步 Cookie。';
        }
      }
      return {
        ok: true,
        value: String((data as { cookie?: string }).cookie || ''),
        updatedAt,
        cookieHash: (data as { cookieHash?: string }).cookieHash || null,
        staleWarning,
      };
    },

    async getQianfanCookie(params: { shopName: string; fallbackValue?: string }): Promise<string> {
      try {
        const result = await this.resolveQianfanCookie(params.shopName);
        return result.value;
      } catch (err) {
        if (params.fallbackValue) {
          console.warn(
            `[control-client] 本地 Cookie 读取失败，使用 fallback：${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return params.fallbackValue;
        }
        throw err;
      }
    },
  };
}

export function createControlClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return createLocalControlClient({ baseUrl: env.LOCAL_CONTROL_URL });
}

/** @deprecated 使用 createLocalControlClient */
export function createControlClient(options: { baseUrl: string; serviceToken: string }) {
  return new ControlClient(options);
}
