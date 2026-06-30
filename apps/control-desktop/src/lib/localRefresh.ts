import { deduplicateProjects } from '@/lib/projectDedup';
import { useAppStore } from '@/stores/appStore';
import type { ProcessInfo, Project } from '@/types/desktop';

export async function refreshLocalProjects() {
  try {
    const local = await window.zhuboDesktop.projects.loadLocal();
    if (local?.length) {
      useAppStore.getState().setProjects(deduplicateProjects(local as Project[]));
    }
  } catch {
    /* 保留已有 projects */
  }
}

export async function refreshPortAnalysis() {
  try {
    const portAnalysis = await window.zhuboDesktop.ports.analyze(
      useAppStore.getState().portConflictIgnoredIds,
    );
    useAppStore.getState().setPortConflictAnalysis(portAnalysis);
  } catch {
    /* 端口检测失败不阻塞 */
  }
}

export async function refreshExternalRunning() {
  try {
    const rows = (await window.zhuboDesktop.projects.detectExternalRunning()) as ProcessInfo[];
    useAppStore.getState().syncExternalRunning(rows);
  } catch {
    /* 外部识别失败不阻塞 */
  }
}

export async function refreshAfterProcessChange() {
  await refreshExternalRunning();
  await new Promise((r) => setTimeout(r, 800));
  await refreshPortAnalysis();
}
