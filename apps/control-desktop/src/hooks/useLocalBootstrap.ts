import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import {
  refreshExternalRunning,
  refreshLocalProjects,
  refreshPortAnalysis,
} from '@/lib/localRefresh';

export { refreshExternalRunning, refreshLocalProjects, refreshPortAnalysis };

export function useLocalBootstrap() {
  useEffect(() => {
    const boot = async () => {
      await refreshLocalProjects();
      await refreshPortAnalysis();
      await refreshExternalRunning();
    };

    void boot();
    const t = setInterval(() => {
      void refreshExternalRunning();
    }, 60000);

    const offProc = window.zhuboDesktop.onProcessStatus((proc: unknown) => {
      useAppStore.getState().setProcess(proc as import('@/types/desktop').ProcessInfo);
    });

    return () => {
      clearInterval(t);
      offProc();
    };
  }, []);
}
