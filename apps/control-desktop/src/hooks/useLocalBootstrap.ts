import { useEffect } from 'react';
import { deduplicateProjects } from '@/lib/projectDedup';
import { useAppStore } from '@/stores/appStore';

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
