import http from 'http';
import { WebSocketServer } from 'ws';
import { createApp } from './app';
import { config, validateProductionConfig } from './config';
import { agentHub } from './services/agentHub';
import { ensureSqlitePragmas } from './lib/prisma';

validateProductionConfig();
void ensureSqlitePragmas();

const app = createApp();
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  if (url.pathname !== '/api/agent/ws') {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get('token') || '';
  wss.handleUpgrade(req, socket, head, (ws) => {
    agentHub.handleConnection(ws, token).catch(() => ws.close());
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Zhubo Control Center listening on http://${config.host}:${config.port}`);
});
