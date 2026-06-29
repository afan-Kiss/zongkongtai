import WebSocket from 'ws';
import { AgentScanPayload, ServerAgentMessage } from '@zhubo/control-shared';
import { prisma } from '../lib/prisma';
import { hashToken } from '../lib/crypto';
import { importScanResults } from './portConflict';
import { withDbRetry } from '../lib/prisma';

interface ConnectedAgent {
  ws: WebSocket;
  agentId: string;
  name: string;
}

class AgentHub {
  private agents = new Map<string, ConnectedAgent>();
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();

  getOnlineAgents() {
    return Array.from(this.agents.values()).map((a) => ({
      agentId: a.agentId,
      name: a.name,
      online: true,
    }));
  }

  isOnline(agentId: string) {
    return this.agents.has(agentId);
  }

  async handleConnection(ws: WebSocket, token: string) {
    const tokenHash = hashToken(token);
    const agent = await prisma.agent.findFirst({ where: { tokenHash } });
    if (!agent) {
      ws.close(4001, 'Agent token invalid');
      return;
    }

    this.agents.set(agent.id, { ws, agentId: agent.id, name: agent.name });
    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: 'online', lastSeenAt: new Date() },
    });

    ws.send(JSON.stringify({ type: 'registered', agentId: agent.id } satisfies ServerAgentMessage));

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'heartbeat') {
          await prisma.agent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
          return;
        }
        if (msg.type === 'scan_result') {
          const started = Date.now();
          const payload = msg.payload as AgentScanPayload;
          const durationMs = payload?.scanDurationMs ?? 0;
          const projectCount = payload?.projects?.length ?? 0;
          const portCount = payload?.projects?.reduce((n, p) => n + (p.ports?.length || 0), 0) ?? 0;

          try {
            const stats = await importScanResults(payload);
            const elapsed = durationMs || Date.now() - started;
            await withDbRetry(() =>
              prisma.agent.update({
                where: { id: agent.id },
                data: { lastSeenAt: new Date(), status: 'online', basePath: payload?.basePath },
              }),
            );
            try {
              await prisma.operationLog.create({
                data: {
                  actor: `agent:${agent.name}`,
                  action: 'scan_upload',
                  targetType: 'agent',
                  targetId: agent.id,
                  detailJson: JSON.stringify({
                    basePath: payload?.basePath,
                    projectCount: stats.projectCount,
                    portCount: stats.portCount,
                    runtimeCount: stats.runtimeCount,
                    unknownCount: stats.unknownCount,
                    conflictCount: stats.conflictCount,
                    warningCount: stats.warningCount,
                    durationMs: elapsed,
                    archivedProjects: stats.archivedProjects,
                    message: `${agent.name} 上传扫描：${stats.projectCount} 项目、${stats.portCount} 端口`,
                  }),
                },
              });
            } catch (logErr) {
              console.warn('scan_upload OperationLog failed', logErr);
            }
            ws.send(
              JSON.stringify({
                type: 'scan_result_ack',
                ok: true,
                message: `扫描已入库：${stats.projectCount} 个项目、${stats.portCount} 个端口`,
                stats: {
                  projectCount: stats.projectCount,
                  portCount: stats.portCount,
                  conflictCount: stats.conflictCount,
                  warningCount: stats.warningCount,
                },
              }),
            );
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error('scan_result import failed', e);
            try {
              await prisma.operationLog.create({
                data: {
                  actor: `agent:${agent.name}`,
                  action: 'scan_upload_failed',
                  targetType: 'agent',
                  targetId: agent.id,
                  detailJson: JSON.stringify({
                    error: errMsg,
                    projectCount,
                    portCount,
                    durationMs: durationMs || Date.now() - started,
                    agentId: agent.id,
                    basePath: payload?.basePath,
                    message: `Agent 扫描上传失败：${errMsg}`,
                  }),
                },
              });
            } catch (logErr) {
              console.warn('scan_upload_failed OperationLog failed', logErr);
            }
            ws.send(
              JSON.stringify({
                type: 'scan_result_ack',
                ok: false,
                message: `扫描完成但云端入库失败：${errMsg}`,
                stats: { projectCount, portCount },
              }),
            );
          }
          return;
        }
        if (msg.type === 'register') {
          await prisma.agent.update({
            where: { id: agent.id },
            data: {
              name: msg.name || agent.name,
              machineName: msg.machineName,
              os: msg.os,
              basePath: msg.basePath,
              version: msg.version,
            },
          });
          return;
        }
        if (msg.type === 'command_result' && msg.requestId) {
          const pending = this.pending.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.requestId);
            if (msg.ok) pending.resolve(msg);
            else pending.reject(new Error(msg.message || '命令执行失败'));
          }
        }
      } catch (e) {
        console.error('Agent message error', e);
      }
    });

    ws.on('close', async () => {
      this.agents.delete(agent.id);
      await prisma.agent.update({ where: { id: agent.id }, data: { status: 'offline' } });
    });
  }

  requestScan(agentId?: string) {
    const target = agentId ? this.agents.get(agentId) : this.agents.values().next().value;
    if (!target) throw new Error('没有在线的 Agent');
    target.ws.send(JSON.stringify({ type: 'request_scan' } satisfies ServerAgentMessage));
  }

  sendCommand(agentId: string, msg: ServerAgentMessage, timeoutMs = 120000): Promise<unknown> {
    const conn = this.agents.get(agentId);
    if (!conn) return Promise.reject(new Error('Agent 不在线'));

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const payload = { ...msg, requestId };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Agent 响应超时'));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      conn.ws.send(JSON.stringify(payload));
    });
  }

  getFirstOnlineAgentId(): string | null {
    const first = this.agents.values().next().value;
    return first?.agentId ?? null;
  }
}

export const agentHub = new AgentHub();
