import { useEffect } from 'react';
import { deduplicateProjects } from '@/lib/projectDedup';
import { useAppStore } from '@/stores/appStore';
import { formatRelativeTime, hashPrefix } from '@/lib/utils';

export function useCloudBootstrap() {
  const setCloud = useAppStore((s) => s.setCloud);
  const setProjects = useAppStore((s) => s.setProjects);
  const setPortConflictAnalysis = useAppStore((s) => s.setPortConflictAnalysis);
  const portConflictIgnoredIds = useAppStore((s) => s.portConflictIgnoredIds);
  const setQianfanCookie = useAppStore((s) => s.setQianfanCookie);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const pushToast = useAppStore((s) => s.pushToast);

  useEffect(() => {
    let toastOnFail = true;

    const refresh = async () => {
      try {
        const conn = await window.zhuboDesktop.cloud.connect();
        if (!conn.ok) {
          setCloud(false, conn.message);
          if (toastOnFail) {
            pushToast('error', conn.message);
            toastOnFail = false;
          }
          return;
        }
        toastOnFail = false;
        const [projects, dash, secrets, agentSnap] = await Promise.all([
          window.zhuboDesktop.cloud.projects(),
          window.zhuboDesktop.cloud.dashboard(),
          window.zhuboDesktop.cloud.secrets().catch(() => []),
          window.zhuboDesktop.agent.status().catch(() => null),
        ]);
        setProjects(deduplicateProjects(projects as import('@/types/desktop').Project[]));
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setCloud(false, msg);
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
    pushToast,
    setPortConflictAnalysis,
    portConflictIgnoredIds,
  ]);
}

export function qianfanStaleMessage(updatedAt: string | null) {
  if (!updatedAt) return '总控台还没有 Cookie 数据';
  const age = Date.now() - Date.parse(updatedAt);
  if (age > 3 * 3600000) {
    return '千帆 Cookie 超过 3 小时没更新，请检查公司电脑千帆客服台是否在线。';
  }
  return `Cookie 状态正常（${formatRelativeTime(updatedAt)}前更新）`;
}

export const qianfanCookieMessage = qianfanStaleMessage;
