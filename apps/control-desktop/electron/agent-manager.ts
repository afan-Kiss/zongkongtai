import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { loadConfig } from './config';
import { cloudClient } from './cloud-client';
import { getLogDir } from './file-logger';

export type AgentRuntimeState = 'unknown' | 'online' | 'offline' | 'starting' | 'start_failed';

export interface AgentStatusSnapshot {
  state: AgentRuntimeState;
  message: string;
  serverUrl: string;
  wsUrl: string;
  localPid: number | null;
  cloudOnline: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatAgeSec: number | null;
  machineName: string;
  agentName: string;
}

const CLOUD_DEFAULT = 'http://8.137.126.18/control';

function agentLogPath() {
  return path.join(getLogDir(), 'agent.log');
}

function appendAgentLog(line: string) {
  const file = agentLogPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
}

function resolveMonorepoRoot(): string | null {
  const cfg = loadConfig();
  const candidates = [
    path.join(cfg.scanRoot, '总控台'),
    path.resolve(process.cwd()),
    path.resolve(__dirname, '../../..'),
    path.resolve(__dirname, '../../../..'),
  ];
  for (const root of candidates) {
    const agentPkg = path.join(root, 'apps', 'control-agent', 'package.json');
    if (fs.existsSync(agentPkg)) return root;
  }
  return null;
}

function buildAgentEnv() {
  const cfg = loadConfig();
  const serverUrl = (cfg.controlServerUrl || CLOUD_DEFAULT).replace(/\/$/, '');
  return {
    ...process.env,
    CONTROL_SERVER_URL: serverUrl,
    AGENT_TOKEN: cfg.agentToken || process.env.AGENT_TOKEN || '',
    AGENT_NAME: process.env.AGENT_NAME || 'Windows本地Agent',
    SCAN_ROOT: cfg.scanRoot || 'E:\\我的软件源码',
    FORCE_COLOR: '0',
  };
}

function wsUrlFromServer(serverUrl: string, token: string) {
  const base = serverUrl.replace(/^http/, 'ws').replace(/\/$/, '');
  return `${base}/api/agent/ws?token=${encodeURIComponent(token)}`;
}

function diagnoseOffline(reason: string, cfg: ReturnType<typeof loadConfig>): string {
  const url = (cfg.controlServerUrl || '').replace(/\/$/, '');
  if (!cfg.agentToken) return 'Agent Token 不对或未配置';
  if (!url.includes('/control')) return '连接地址不是云端 /control';
  if (/4790|4791|xiangyuzhubao\.xyz|wss:\/\//i.test(url)) {
    return '连接地址使用了本地端口或域名，请改为 http://8.137.126.18/control';
  }
  if (reason.includes('fetch') || reason.includes('ECONNREFUSED') || reason.includes('network')) {
    return 'WebSocket 连接失败，请检查网络和云端总控是否在线';
  }
  if (reason.includes('403') || reason.includes('无效') || reason.includes('token')) {
    return 'Agent Token 不对';
  }
  return reason || '本地 Agent 没运行';
}

export class AgentManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private localPid: number | null = null;
  private state: AgentRuntimeState = 'unknown';
  private message = '尚未检查';
  private lastHeartbeatAt: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private starting = false;

  startPolling(intervalMs = 15000) {
    if (this.pollTimer) return;
    void this.refresh();
    this.pollTimer = setInterval(() => void this.refresh(), intervalMs);
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  getSnapshot(): AgentStatusSnapshot {
    const cfg = loadConfig();
    const serverUrl = (cfg.controlServerUrl || CLOUD_DEFAULT).replace(/\/$/, '');
    const ageSec = this.lastHeartbeatAt
      ? Math.floor((Date.now() - Date.parse(this.lastHeartbeatAt)) / 1000)
      : null;
    return {
      state: this.state,
      message: this.message,
      serverUrl,
      wsUrl: wsUrlFromServer(serverUrl, cfg.agentToken || ''),
      localPid: this.localPid,
      cloudOnline: this.state === 'online',
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastHeartbeatAgeSec: ageSec,
      machineName: os.hostname(),
      agentName: process.env.AGENT_NAME || 'Windows本地Agent',
    };
  }

  async refresh(): Promise<AgentStatusSnapshot> {
    const cfg = loadConfig();
    if (!cfg.agentToken) {
      this.state = 'offline';
      this.message = diagnoseOffline('', cfg);
      this.emit('status', this.getSnapshot());
      return this.getSnapshot();
    }

    try {
      await cloudClient.ensureLogin();
      const agents = await cloudClient.agents();
      const host = os.hostname().toLowerCase();
      const mine = (agents as any[]).filter((a) => {
        const mn = String(a.machineName || '').toLowerCase();
        return mn === host || mn.includes(host) || host.includes(mn);
      });
      const online = mine.find((a) => a.status === 'online' || a.connected);
      if (online) {
        this.state = 'online';
        this.lastHeartbeatAt = online.lastSeenAt || online.updatedAt || new Date().toISOString();
        this.message = '云端已收到本机 Agent 心跳';
      } else if (mine.length) {
        this.state = 'offline';
        this.message = '云端能打开，但本机 Agent 没上报心跳';
        this.lastHeartbeatAt = mine[0]?.lastSeenAt || null;
      } else if (this.localPid) {
        this.state = 'starting';
        this.message = 'Agent 正在启动，等待云端注册…';
      } else {
        this.state = 'offline';
        this.message = diagnoseOffline('', cfg);
      }
    } catch (e) {
      this.state = 'offline';
      this.message = diagnoseOffline(e instanceof Error ? e.message : String(e), cfg);
    }

    this.emit('status', this.getSnapshot());
    return this.getSnapshot();
  }

  async ensureRunning(autoStart = true): Promise<AgentStatusSnapshot> {
    const snap = await this.refresh();
    if (snap.cloudOnline || this.starting) return snap;
    if (!autoStart) return snap;
    return this.startAgent();
  }

  async startAgent(): Promise<AgentStatusSnapshot> {
    if (this.starting) return this.getSnapshot();
    if (this.child && this.localPid) {
      appendAgentLog(`Agent 已在运行 PID=${this.localPid}`);
      return this.refresh();
    }

    const cfg = loadConfig();
    if (!cfg.agentToken) {
      this.state = 'start_failed';
      this.message = 'Agent Token 未配置，请在设置页填写';
      return this.getSnapshot();
    }

    const root = resolveMonorepoRoot();
    if (!root) {
      this.state = 'start_failed';
      this.message = '找不到总控台源码目录，无法启动 Agent';
      appendAgentLog('resolveMonorepoRoot failed');
      return this.getSnapshot();
    }

    this.starting = true;
    this.state = 'starting';
    this.message = '正在后台启动本地 Agent…';
    this.emit('status', this.getSnapshot());

    const agentDir = path.join(root, 'apps', 'control-agent');
    const logStream = fs.createWriteStream(agentLogPath(), { flags: 'a' });
    appendAgentLog(`spawn npm run dev cwd=${agentDir}`);

    const child = spawn('npm', ['run', 'dev'], {
      cwd: agentDir,
      env: buildAgentEnv(),
      windowsHide: true,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.child = child;
    this.localPid = child.pid ?? null;
    child.stdout?.on('data', (buf) => {
      logStream.write(buf);
      appendAgentLog(String(buf).trim().slice(0, 500));
    });
    child.stderr?.on('data', (buf) => {
      logStream.write(buf);
      appendAgentLog(`ERR ${String(buf).trim().slice(0, 500)}`);
    });
    child.on('exit', (code) => {
      appendAgentLog(`Agent exited code=${code}`);
      this.child = null;
      this.localPid = null;
      this.starting = false;
      if (this.state !== 'online') {
        this.state = 'start_failed';
        this.message = code === 0 ? 'Agent 已退出' : `Agent 启动失败，退出码 ${code}`;
      }
      this.emit('status', this.getSnapshot());
    });

    this.starting = false;
    setTimeout(() => void this.refresh(), 5000);
    return this.getSnapshot();
  }

  async restartAgent() {
    await this.stopAgent(false);
    await new Promise((r) => setTimeout(r, 800));
    return this.startAgent();
  }

  async stopAgent(killProcess = true) {
    if (killProcess && this.child && this.localPid) {
      spawn('taskkill', ['/PID', String(this.localPid), '/T', '/F'], {
        windowsHide: true,
        shell: true,
      });
      appendAgentLog(`stop Agent PID=${this.localPid}`);
    }
    this.child = null;
    this.localPid = null;
    this.state = 'offline';
    this.message = '本地 Agent 没运行';
    this.emit('status', this.getSnapshot());
    return this.getSnapshot();
  }

  openAgentLog() {
    const file = agentLogPath();
    if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
    return file;
  }
}

export const agentManager = new AgentManager();
