import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import { formatRelativeTime, hashPrefix } from '@/lib/utils';

export function useCloudBootstrap() {
  const setCloud = useAppStore((s) => s.setCloud);
  const setProjects = useAppStore((s) => s.setProjects);
  const setQianfanCookie = useAppStore((s) => s.setQianfanCookie);
  const pushToast = useAppStore((s) => s.pushToast);
  const toastOnFail = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const conn = await window.zhuboDesktop.cloud.connect();
      if (!conn.ok) {
        setCloud(false, conn.message);
        if (toastOnFail.current) {
          pushToast('error', conn.message);
          toastOnFail.current = false;
        }
        return;
      }
      toastOnFail.current = false;
      const [projects, dash, secrets] = await Promise.all([
        window.zhuboDesktop.cloud.projects(),
        window.zhuboDesktop.cloud.dashboard(),
        window.zhuboDesktop.cloud.secrets().catch(() => []),
      ]);
      setProjects(projects);
      setCloud(true, '已连接', {
        agentsOnline: conn.agentsOnline ?? dash.agentsOnline ?? 0,
        conflictCount: dash.conflictCount ?? 0,
        warningCount: dash.warningCount ?? 0,
      });
      const qf = (secrets as any[]).find((s) => s.platform === 'qianfan' && s.keyName === 'cookie');
      if (qf) setQianfanCookie(qf.updatedAt || qf.lastSeenAt, qf.cookieHash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCloud(false, msg);
    }
  }, [setCloud, setProjects, setQianfanCookie, pushToast]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    const off = window.zhuboDesktop.onProcessStatus((proc: any) => {
      useAppStore.getState().setProcess(proc);
    });
    return () => {
      clearInterval(t);
      off();
    };
  }, [refresh]);

  return { refresh };
}

export function qianfanStaleMessage(updatedAt: string | null) {
  if (!updatedAt) return '总控台还没有 Cookie 数据';
  const age = Date.now() - Date.parse(updatedAt);
  if (age > 3 * 3600000) {
    return '千帆 Cookie 超过 3 小时没更新，请检查公司电脑千帆客服台是否在线。';
  }
  return `千帆 Cookie ${formatRelativeTime(updatedAt)}前更新`;
}

/** @deprecated use qianfanStaleMessage */
export const qianfanCookieMessage = qianfanStaleMessage;
