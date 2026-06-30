import path from 'path';
import { manifestToScanFields } from '../../../packages/control-shared/src/manifest';
import { enrichProjectForDetection, isQianfanRelayProject } from './external-project-status';
import { enrichQianfanStartCommand } from './start-command';
import { getScanRoot, scanManifestsLocal } from './manifest-scanner';

function enrichQianfanRelayFields<T extends Record<string, unknown>>(project: T): T {
  if (!isQianfanRelayProject(project as { code?: string; name?: string })) return project;
  const withStart = enrichQianfanStartCommand(project);
  return enrichProjectForDetection(withStart as any) as T;
}

/** 从本地 manifest 扫描构建项目列表，不依赖云端登录 */
export function loadLocalProjectsFromManifests(): Array<Record<string, unknown>> {
  const root = getScanRoot();
  const { manifests } = scanManifestsLocal(root);
  const projects: Array<Record<string, unknown>> = [];

  for (const m of manifests) {
    const dir = m.localPath || path.join(root, m.name);
    const fields = manifestToScanFields(m, dir);
    projects.push(
      enrichQianfanRelayFields({
        id: `local-${m.code}`,
        name: m.name,
        code: m.code,
        category: m.category,
        localPath: fields.localPath || dir,
        gitRemote: m.gitRemote ?? fields.gitRemote,
        riskLevel: m.riskLevel,
        manifestGroup: m.control?.group,
        manifestFavorite: m.control?.favorite,
        startCommand: fields.startCommand,
        devCommand: fields.devCommand,
        desktopStartCommand: fields.desktopStartCommand,
        healthUrl: fields.healthUrl,
        localWebUrl: fields.localWebUrl,
        localHealthUrl: fields.localHealthUrl,
        publicUrl: fields.publicUrl,
        internalUrl: fields.internalUrl,
        ports: fields.ports,
        commands: fields.commands,
      }),
    );
  }

  return projects;
}

export function findLocalProjectById(projectId: string) {
  const projects = loadLocalProjectsFromManifests();
  return (
    projects.find((p) => p.id === projectId) ||
    projects.find((p) => `local-${p.code}` === projectId) ||
    projects.find((p) => p.code === projectId)
  );
}
