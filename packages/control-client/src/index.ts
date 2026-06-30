export interface LocalControlClientOptions {
  baseUrl?: string;
}

export interface QianfanCookieResult {
  value: string;
  updatedAt: string;
  cookieHash?: string | null;
  staleWarning?: string;
}

/** @deprecated Cookie 由千帆中转机器人独立管理，请勿通过总控读取 */
export class ControlClient {
  constructor(_options: { baseUrl: string; serviceToken: string }) {}

  async getQianfanCookie(_params: {
    shopName: string;
    projectName?: string;
    fallbackValue?: string;
  }): Promise<string> {
    throw new Error('Cookie 由千帆中转机器人项目独立处理，总控不再提供 Cookie 读取');
  }
}

/** @deprecated Cookie 由千帆中转机器人独立管理 */
export function createLocalControlClient(_options: LocalControlClientOptions = {}) {
  return {
    async resolveQianfanCookie(_shopName: string): Promise<QianfanCookieResult & { ok: boolean }> {
      throw new Error('Cookie 由千帆中转机器人项目独立处理，总控不再提供 Cookie 读取');
    },
    async getQianfanCookie(_params: { shopName: string; fallbackValue?: string }): Promise<string> {
      throw new Error('Cookie 由千帆中转机器人项目独立处理，总控不再提供 Cookie 读取');
    },
  };
}

/** @deprecated */
export function createControlClientFromEnv(_env: NodeJS.ProcessEnv = process.env) {
  return createLocalControlClient();
}

/** @deprecated */
export function createControlClient(options: { baseUrl: string; serviceToken: string }) {
  return new ControlClient(options);
}
