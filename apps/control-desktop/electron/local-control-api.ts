import http from 'http';
import net from 'net';
import { loadConfig } from './config';
import { fileLog } from './file-logger';
import { listLocalCookieCards, resolveLocalCookie, saveLocalCookie } from './local-cookie-store';

const DEFAULT_PORT = 4793;

function readBody(req: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function isPortInUse(port: number, host = '127.0.0.1') {
  return new Promise<boolean>((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(true));
    tester.once('listening', () => tester.close(() => resolve(false)));
    tester.listen(port, host);
  });
}

export function getLocalControlApiPort() {
  const cfg = loadConfig();
  return Number(cfg.localControlApiPort || DEFAULT_PORT);
}

let server: http.Server | null = null;

export async function startLocalControlApi() {
  const port = getLocalControlApiPort();
  if (server) return { server, port, alreadyRunning: true };
  if (await isPortInUse(port)) {
    fileLog.app(`本地 Cookie API ${port} 已占用，可能已在运行`);
    return { server: null, port, alreadyRunning: true };
  }

  server = http.createServer((req, res) => {
    void (async () => {
      const pathOnly = String(req.url || '').split('?')[0];
      try {
        if (req.method === 'GET' && pathOnly === '/api/health') {
          sendJson(res, 200, { ok: true, service: 'zhubo-local-control' });
          return;
        }

        if (req.method === 'GET' && pathOnly === '/api/local-cookies/shops') {
          sendJson(res, 200, listLocalCookieCards());
          return;
        }

        if (req.method === 'GET' && pathOnly === '/api/local-cookies/resolve') {
          const u = new URL(req.url || '', 'http://127.0.0.1');
          const platform = u.searchParams.get('platform') || 'qianfan';
          const shopName = u.searchParams.get('shopName') || '';
          const row = resolveLocalCookie(platform, shopName);
          if (!row) {
            sendJson(res, 404, { ok: false, error: '未找到 Cookie' });
            return;
          }
          sendJson(res, 200, row);
          return;
        }

        if (req.method === 'POST' && pathOnly === '/api/local-cookies/upload') {
          const bodyText = await readBody(req);
          const body = bodyText ? JSON.parse(bodyText) : {};
          const saved = saveLocalCookie({
            shopName: body.shopName,
            platform: body.platform,
            cookie: body.cookie,
            source: body.source,
            cookieHash: body.cookieHash,
          });
          sendJson(res, 200, {
            ok: true,
            shopName: saved.shopName,
            hash8: saved.cookieHash.slice(0, 8),
            length: saved.length,
            updatedAt: saved.updatedAt,
          });
          return;
        }

        sendJson(res, 404, { ok: false, message: 'not found' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        fileLog.app(`本地 API 错误: ${msg.slice(0, 120)}`, 'error');
        sendJson(res, 500, { ok: false, error: msg });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(port, '127.0.0.1', () => resolve());
  });

  fileLog.app(`本地 Cookie API 已启动 http://127.0.0.1:${port}`);
  return { server, port, alreadyRunning: false };
}

export function stopLocalControlApi() {
  if (!server) return;
  server.close();
  server = null;
}
