import WebSocket from 'ws';
import { ServerAgentMessage } from '@zhubo/control-shared';
import { agentConfig, getWsUrl } from './config';
import { scanRoot, getMachineInfo } from './scanner';
import { runWhitelistedCommand, stopWhitelistedCommand } from './commandRunner';

let agentId = '';
let ws: WebSocket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

function connect() {
  const url = getWsUrl();
  console.log('Connecting to', agentConfig.serverUrl);
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('WebSocket connected');
    ws?.send(
      JSON.stringify({
        type: 'register',
        name: agentConfig.name,
        ...getMachineInfo(),
        basePath: agentConfig.scanRoot,
        version: agentConfig.version,
      }),
    );
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      ws?.send(JSON.stringify({ type: 'heartbeat' }));
    }, 30000);
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ServerAgentMessage & { requestId?: string };
      if (msg.type === 'registered') {
        agentId = (msg as { agentId: string }).agentId;
        console.log('Registered agent:', agentId);
        doScan();
        return;
      }
      if (msg.type === 'request_scan') {
        doScan();
        return;
      }
      if (msg.type === 'scan_result_ack') {
        const ack = msg as { ok?: boolean; message?: string };
        if (ack.ok) console.log('云端确认：', ack.message || '扫描已入库');
        else console.error('扫描完成但云端入库失败：', ack.message || '未知错误');
        return;
      }
      if (msg.type === 'run_command' && msg.requestId) {
        const result = await runWhitelistedCommand(msg.commandId, msg.command, msg.cwd);
        ws?.send(JSON.stringify({ type: 'command_result', requestId: msg.requestId, ...result }));
        return;
      }
      if (msg.type === 'stop_command' && msg.requestId) {
        const result = await stopWhitelistedCommand(msg.commandId);
        ws?.send(JSON.stringify({ type: 'command_result', requestId: msg.requestId, ...result }));
      }
    } catch (e) {
      console.error('WS message error', e);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket closed, reconnect in 5s');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => console.error('WS error', err.message));
}

function doScan() {
  if (!agentId) return;
  console.log('Scanning', agentConfig.scanRoot);
  const t0 = Date.now();
  try {
    const payload = scanRoot(agentConfig.scanRoot, agentId);
    payload.scanDurationMs = Date.now() - t0;
    console.log(
      `Found ${payload.projects.length} projects, ${payload.runtimePorts.length} runtime ports (${payload.scanDurationMs}ms)`,
    );
    ws?.send(JSON.stringify({ type: 'scan_result', payload }));
  } catch (e) {
    console.error('Scan failed', e);
  }
}

export function startAgent() {
  registerAgentHttp().finally(() => connect());
}

async function registerAgentHttp() {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (agentConfig.serviceToken) {
      headers.Authorization = `Bearer ${agentConfig.serviceToken}`;
      headers['x-service-token'] = agentConfig.serviceToken;
    }
    await fetch(`${agentConfig.serverUrl}/api/agents/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: agentConfig.name,
        token: agentConfig.token,
        ...getMachineInfo(),
        basePath: agentConfig.scanRoot,
      }),
    });
  } catch (e) {
    console.warn('HTTP register failed (will retry via WS)', e);
  }
}

export { doScan };
