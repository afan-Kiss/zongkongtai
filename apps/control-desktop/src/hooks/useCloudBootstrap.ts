import { useEffect } from 'react';
import { deduplicateProjects } from '@/lib/projectDedup';
import { formatRelativeTime } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';

export function useCloudBootstrap() {
  const setCloud = useAppStore((s) => s.setCloud);
  const setProjects = useAppStore((s) => s.setProjects);
  const setPortConflictAnalysis = useAppStore((s) => s.setPortConflictAnalysis);
  const portConflictIgnoredIds = useAppStore((s) => s.portConflictIgnoredIds);
  const setQianfanCookie = useAppStore((s) => s.setQianfanCookie);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);

  useEffect(() => {
    const loadLocalProjects = async () => {
      try {
        const local = await window.zhuboDesktop.projects.loadLocal();
        if (local?.length) {
          setProjects(deduplicateProjects(local as import('@/types/desktop').Project[]));
        }
      } catch {
        /* 本地扫描失败时保留已有 projects */
      }
    };

    const refreshPorts = async () => {
      try {
        const portAnalysis = await window.zhuboDesktop.ports.analyze(portConflictIgnoredIds);
        setPortConflictAnalysis(portAnalysis);
      } catch {
        /* 端口检测失败不影响本地模式 */
      }
    };

    const refresh = async () => {
      await loadLocalProjects();
      await refreshPorts();

      try {
        const conn = await window.zhuboDesktop.cloud.connect();
        if (!conn.ok) {
          setCloud(false, '未连接');
          setQianfanCookie(null, null);
          return;
        }

        const [projects, dash, secrets, agentSnap] = await Promise.all([
          window.zhuboDesktop.cloud.projects(),
          window.zhuboDesktop.cloud.dashboard(),
          window.zhuboDesktop.cloud.secrets().catch(() => []),
          window.zhuboDesktop.agent.status().catch(() => null),
        ]);
        if (projects?.length) {
          setProjects(deduplicateProjects(projects as import('@/types/desktop').Project[]));
        }
        if (agentSnap) setAgentStatus(agentSnap as any);
        const portAnalysis = await window.zhuboDesktop.ports
          .analyze(portConflictIgnoredIds)
          .catch(() => null);
        if (portAnalysis) setPortConflictAnalysis(portAnalysis);
        setCloud(true, '已连接', {
          agentsOnline: (agentSnap as any)?.cloudOnline ? 1 : (conn.agentsOnline ?? 0),
          conflictCount: portAnalysis?.seriousCount ?? dash.conflictCount ?? 0,
          warningCount: dash.warningCount ?? 0,
        });
        const qf = (secrets as any[]).find(
          (s) => s.platform === 'qianfan' && s.keyName === 'cookie',
        );
        if (qf) setQianfanCookie(qf.updatedAt || qf.lastSeenAt, qf.cookieHash);
        else setQianfanCookie(dash?.qianfanCookieUpdatedAt ?? null, null);
      } catch {
        setCloud(false, '未连接');
      }
    };

    refresh();
    const t = setInterval(refresh, 30000);
    const offProc = window.zhuboDesktop.onProcessStatus((proc: any) => {
      useAppStore.getState().setProcess(proc);
    });
    const offAgent = window.zhuboDesktop.agent.onStatus((snap: any) => {
      setAgentStatus(snap);
    });
    void window.zhuboDesktop.agent.ensure();

    return () => {
      clearInterval(t);
      offProc();
      offAgent();
    };
  }, [
    setCloud,
    setProjects,
    setQianfanCookie,
    setAgentStatus,
    setPortConflictAnalysis,
    portConflictIgnoredIds,
  ]);
}

export function qianfanStaleMessage(updatedAt: string | null, cloudConnected = true) {
  if (!cloudConnected) return '需连接云端后查看';
  if (!updatedAt) return '暂未收到千帆 Cookie';
  const age = Date.now() - Date.parse(updatedAt);
  if (age > 6 * 3600000) {
    return 'Cookie 超过 6 小时没更新，建议立即同步。';
  }
  if (age > 2 * 3600000) {
    return 'Cookie 即将过期，建议点立即同步。';
  }
  return `Cookie 状态正常（${formatRelativeTime(updatedAt)}前更新）`;
}

export const qianfanCookieMessage = qianfanStaleMessage;
