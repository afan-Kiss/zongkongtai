import { useEffect } from 'react';
import { deduplicateProjects } from '@/lib/projectDedup';
import { useAppStore } from '@/stores/appStore';
import type { ProcessInfo } from '@/types/desktop';

export async function refreshExternalRunning() {
  try {
    const rows = (await window.zhuboDesktop.projects.detectExternalRunning()) as ProcessInfo[];
    useAppStore.getState().syncExternalRunning(rows);
  } catch {
    /* 外部识别失败不阻塞 */
  }
}

export function useLocalBootstrap() {
  const setProjects = useAppStore((s) => s.setProjects);
  const setPortConflictAnalysis = useAppStore((s) => s.setPortConflictAnalysis);
  const portConflictIgnoredIds = useAppStore((s) => s.portConflictIgnoredIds);

  useEffect(() => {
    const refresh = async () => {
      try {
        const local = await window.zhuboDesktop.projects.loadLocal();
        if (local?.length) {
          setProjects(deduplicateProjects(local as import('@/types/desktop').Project[]));
        }
      } catch {
        /* 保留已有 projects */
      }

      try {
        const portAnalysis = await window.zhuboDesktop.ports.analyze(portConflictIgnoredIds);
        setPortConflictAnalysis(portAnalysis);
      } catch {
        /* 端口检测失败不阻塞 */
      }

      await refreshExternalRunning();
    };

    refresh();
    const t = setInterval(refresh, 30000);
    const offProc = window.zhuboDesktop.onProcessStatus((proc: any) => {
      useAppStore.getState().setProcess(proc);
    });

    return () => {
      clearInterval(t);
      offProc();
    };
  }, [setProjects, setPortConflictAnalysis, portConflictIgnoredIds]);
}
