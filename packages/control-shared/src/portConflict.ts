/** 端口冲突分析 — 重复登记 / 配置冲突 / 真实占用 */

export type PortConflictType = 'duplicate_registration' | 'config_conflict' | 'real_occupation';

export interface PortConflictProjectRef {
  id: string;
  name: string;
  code?: string;
  localPath?: string | null;
}

export interface PortConflictItem {
  id: string;
  port: number;
  type: PortConflictType;
  projects: PortConflictProjectRef[];
  processName?: string;
  pid?: number;
  commandLine?: string;
  suggestion: string;
  plainText: string;
  safeToKill: boolean;
  killProjectId?: string;
  recommendedPorts: number[];
  canDedupeManifest?: boolean;
  dedupeProjectId?: string;
  dedupeProjectName?: string;
  duplicateRawCount?: number;
}

export interface PortConflictAnalysis {
  items: PortConflictItem[];
  duplicateCount: number;
  configConflictCount: number;
  realOccupationCount: number;
  seriousCount: number;
  autoFixableCount: number;
  topBarLabel: string;
  topBarText: string;
  topBarOk: boolean;
  topBarClickable: boolean;
  healthMessage: string;
  analyzedAt: string;
}

export interface CloudPortRecord {
  id?: string;
  port: number;
  projectId?: string | null;
  project?: {
    id?: string;
    name?: string;
    code?: string;
    localPath?: string | null;
  };
  conflictLevel?: string | null;
  conflictReason?: string | null;
  role?: string | null;
  isRuntimeDetected?: boolean;
  processName?: string | null;
  pid?: number | null;
}

export interface LocalPortRecord {
  port: number;
  pid?: number;
  processName?: string;
}

export interface ProjectPortInput {
  id: string;
  name: string;
  code?: string;
  localPath?: string | null;
  riskLevel?: string | null;
  ports?: Array<{ port: number; role?: string | null; conflictLevel?: string | null }>;
  manifestDuplicatePorts?: number[];
}

export interface PortConflictAnalyzeOptions {
  ignoredIds?: string[];
  enrich?: (item: PortConflictItem) => PortConflictItem;
}

/** 不推荐使用的常见 / 已占用核心端口 */
export const AVOID_RECOMMEND_PORTS = new Set([
  5173, 3000, 3001, 7890, 8080, 4723, 4725, 4726, 4790, 4791, 9322, 9323, 9333, 19527,
]);

const CLIENT_ROLES = new Set(['client_reference', 'proxy']);

function isListenerRole(role?: string | null): boolean {
  if (!role) return true;
  return !CLIENT_ROLES.has(role);
}

function projectRef(p: {
  id: string;
  name: string;
  code?: string;
  localPath?: string | null;
}): PortConflictProjectRef {
  return { id: p.id, name: p.name, code: p.code, localPath: p.localPath };
}

function uniqueProjects(list: PortConflictProjectRef[]): PortConflictProjectRef[] {
  const seen = new Set<string>();
  const out: PortConflictProjectRef[] = [];
  for (const p of list) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function recommendFreePorts(occupied: Iterable<number>, count = 3): number[] {
  const used = new Set<number>(occupied);
  const ranges = [
    { start: 4740, end: 4799 },
    { start: 5180, end: 5250 },
    { start: 7800, end: 7899 },
  ];
  const picks: number[] = [];
  for (const range of ranges) {
    for (let port = range.start; port <= range.end && picks.length < count; port++) {
      if (used.has(port) || AVOID_RECOMMEND_PORTS.has(port)) continue;
      picks.push(port);
      used.add(port);
    }
  }
  return picks;
}

function collectOccupiedPorts(
  cloudPorts: CloudPortRecord[],
  localPorts: LocalPortRecord[],
  projects: ProjectPortInput[],
): Set<number> {
  const used = new Set<number>();
  for (const p of cloudPorts) used.add(p.port);
  for (const p of localPorts) used.add(p.port);
  for (const proj of projects) {
    for (const row of proj.ports || []) used.add(row.port);
    for (const port of proj.manifestDuplicatePorts || []) used.add(port);
  }
  return used;
}

function duplicateSuggestion(port: number, projectName: string, rawCount: number): string {
  return `这个端口在「${projectName}」里重复写了 ${rawCount} 次，显示时已经帮你去重，不影响使用。`;
}

function configSuggestion(
  port: number,
  projects: PortConflictProjectRef[],
  recommended: number[],
): string {
  const names = projects.map((p) => p.name).join('、');
  const keep = projects[0]?.name || '其中一个项目';
  const alt = recommended[0] ?? 4740;
  return `这个端口被多个项目登记了（${names}）。建议保留「${keep}」使用 ${port}，另一个项目换到 ${alt}。`;
}

function occupationSuggestion(
  port: number,
  processName: string | undefined,
  safeToKill: boolean,
  projectName?: string,
): string {
  if (safeToKill && projectName) {
    return `${port} 当前被 ${processName || '进程'} 占用。如果这是「${projectName}」旧进程，可以关闭后重试。`;
  }
  return `这个端口被${processName ? ` ${processName}` : '未知进程'}占用，不能自动关闭，避免误杀其他软件。`;
}

export function analyzePortConflicts(
  cloudPorts: CloudPortRecord[],
  localPorts: LocalPortRecord[],
  projects: ProjectPortInput[],
  opts: PortConflictAnalyzeOptions = {},
): PortConflictAnalysis {
  const ignored = new Set(opts.ignoredIds || []);
  const occupied = collectOccupiedPorts(cloudPorts, localPorts, projects);
  const localByPort = new Map(localPorts.map((p) => [p.port, p]));
  const cloudByPort = new Map<number, CloudPortRecord[]>();

  for (const row of cloudPorts) {
    const list = cloudByPort.get(row.port) || [];
    list.push(row);
    cloudByPort.set(row.port, list);
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const items: PortConflictItem[] = [];

  const portSet = new Set<number>();
  for (const p of cloudPorts) portSet.add(p.port);
  for (const p of localPorts) portSet.add(p.port);
  for (const proj of projects) {
    for (const row of proj.ports || []) portSet.add(row.port);
    for (const port of proj.manifestDuplicatePorts || []) portSet.add(port);
  }

  for (const port of [...portSet].sort((a, b) => a - b)) {
    const cloudRows = cloudByPort.get(port) || [];
    const local = localByPort.get(port);
    const recommended = recommendFreePorts(occupied);

    // 1. 同项目重复登记
    const dupProjects: Array<{ project: ProjectPortInput; rawCount: number }> = [];
    for (const proj of projects) {
      const fromPorts = (proj.ports || []).filter((r) => r.port === port);
      const manifestDup = proj.manifestDuplicatePorts?.includes(port);
      const cloudSame = cloudRows.filter((r) => r.projectId === proj.id);
      const rawCount = Math.max(fromPorts.length, cloudSame.length, manifestDup ? 2 : 0);
      if (rawCount > 1 || manifestDup) {
        dupProjects.push({ project: proj, rawCount: Math.max(rawCount, 2) });
      }
    }
    for (const { project: proj, rawCount } of dupProjects) {
      const id = `dup:${port}:${proj.id}`;
      if (ignored.has(id)) continue;
      const suggestion = duplicateSuggestion(port, proj.name, rawCount);
      items.push({
        id,
        port,
        type: 'duplicate_registration',
        projects: [projectRef(proj)],
        suggestion,
        plainText: suggestion,
        safeToKill: false,
        recommendedPorts: recommended,
        canDedupeManifest: !!proj.manifestDuplicatePorts?.includes(port),
        dedupeProjectId: proj.id,
        dedupeProjectName: proj.name,
        duplicateRawCount: rawCount,
      });
    }

    // 2. 多项目配置冲突
    const listenerProjects = uniqueProjects(
      cloudRows
        .filter((r) => r.projectId && isListenerRole(r.role))
        .map((r) => {
          const fromList = r.projectId ? projectById.get(r.projectId) : undefined;
          return projectRef({
            id: r.projectId!,
            name: fromList?.name || r.project?.name || '未知项目',
            code: fromList?.code || r.project?.code,
            localPath: fromList?.localPath || r.project?.localPath,
          });
        }),
    );

    const hasServerConflict =
      cloudRows.some((r) => r.conflictLevel === 'conflict') || listenerProjects.length >= 2;

    if (hasServerConflict && listenerProjects.length >= 2) {
      const id = `cfg:${port}`;
      if (!ignored.has(id)) {
        const suggestion = configSuggestion(port, listenerProjects, recommended);
        items.push({
          id,
          port,
          type: 'config_conflict',
          projects: listenerProjects,
          processName: local?.processName,
          pid: local?.pid,
          suggestion,
          plainText: suggestion,
          safeToKill: false,
          recommendedPorts: recommended,
        });
      }
    }

    // 3. 真实占用 — 本地有监听（仅关注已登记端口）
    const isRegisteredPort =
      cloudRows.length > 0 ||
      projects.some(
        (proj) =>
          (proj.ports || []).some((r) => r.port === port) ||
          proj.manifestDuplicatePorts?.includes(port),
      );

    if (local?.pid && isRegisteredPort) {
      const id = `occ:${port}:${local.pid}`;
      if (!ignored.has(id)) {
        const registered = listenerProjects.length
          ? listenerProjects
          : uniqueProjects(
              cloudRows
                .filter((r) => r.projectId)
                .map((r) => {
                  const fromList = projectById.get(r.projectId!);
                  return projectRef({
                    id: r.projectId!,
                    name: fromList?.name || r.project?.name || '未知项目',
                    code: fromList?.code || r.project?.code,
                    localPath: fromList?.localPath || r.project?.localPath,
                  });
                }),
            );

        let item: PortConflictItem = {
          id,
          port,
          type: 'real_occupation',
          projects: registered,
          processName: local.processName,
          pid: local.pid,
          suggestion: occupationSuggestion(port, local.processName, false),
          plainText: occupationSuggestion(port, local.processName, false),
          safeToKill: false,
          recommendedPorts: recommended,
        };
        if (opts.enrich) item = opts.enrich(item);
        items.push(item);
      }
    }
  }

  const duplicateCount = items.filter((i) => i.type === 'duplicate_registration').length;
  const configConflictCount = items.filter((i) => i.type === 'config_conflict').length;
  const realOccupationCount = items.filter((i) => i.type === 'real_occupation').length;
  const seriousCount = configConflictCount + realOccupationCount;
  const autoFixableCount = items.filter((i) => i.safeToKill || i.canDedupeManifest).length;

  let topBarLabel = '端口';
  let topBarText = '正常';
  let topBarOk = true;
  let topBarClickable = false;

  if (seriousCount > 0) {
    topBarLabel = '端口冲突';
    topBarText = `${seriousCount} 个`;
    topBarOk = false;
    topBarClickable = true;
  } else if (duplicateCount > 0) {
    topBarLabel = '端口';
    topBarText = '有重复登记，不影响使用';
    topBarOk = true;
    topBarClickable = true;
  } else {
    topBarLabel = '端口';
    topBarText = '正常';
    topBarOk = true;
    topBarClickable = false;
  }

  const healthMessage =
    seriousCount > 0
      ? `发现 ${seriousCount} 个端口需要处理${duplicateCount ? `，${duplicateCount} 个只是重复登记，已自动去重显示` : ''}。`
      : duplicateCount > 0
        ? `${duplicateCount} 个重复登记，已自动去重显示，不影响使用。`
        : '端口状态正常。';

  return {
    items,
    duplicateCount,
    configConflictCount,
    realOccupationCount,
    seriousCount,
    autoFixableCount,
    topBarLabel,
    topBarText,
    topBarOk,
    topBarClickable,
    healthMessage,
    analyzedAt: new Date().toISOString(),
  };
}

export function summarizePortConflictItems(
  items: PortConflictItem[],
  analyzedAt = new Date().toISOString(),
): PortConflictAnalysis {
  const duplicateCount = items.filter((i) => i.type === 'duplicate_registration').length;
  const configConflictCount = items.filter((i) => i.type === 'config_conflict').length;
  const realOccupationCount = items.filter((i) => i.type === 'real_occupation').length;
  const seriousCount = configConflictCount + realOccupationCount;
  const autoFixableCount = items.filter((i) => i.safeToKill || i.canDedupeManifest).length;

  let topBarLabel = '端口';
  let topBarText = '正常';
  let topBarOk = true;
  let topBarClickable = false;

  if (seriousCount > 0) {
    topBarLabel = '端口冲突';
    topBarText = `${seriousCount} 个`;
    topBarOk = false;
    topBarClickable = true;
  } else if (duplicateCount > 0) {
    topBarLabel = '端口';
    topBarText = '有重复登记，不影响使用';
    topBarOk = true;
    topBarClickable = true;
  }

  const healthMessage =
    seriousCount > 0
      ? `发现 ${seriousCount} 个端口需要处理${duplicateCount ? `，${duplicateCount} 个只是重复登记，已自动去重显示` : ''}。`
      : duplicateCount > 0
        ? `${duplicateCount} 个重复登记，已自动去重显示，不影响使用。`
        : '端口状态正常。';

  return {
    items,
    duplicateCount,
    configConflictCount,
    realOccupationCount,
    seriousCount,
    autoFixableCount,
    topBarLabel,
    topBarText,
    topBarOk,
    topBarClickable,
    healthMessage,
    analyzedAt,
  };
}

export function formatPortConflictCopy(item: PortConflictItem): string {
  const lines = [
    `端口 ${item.port}`,
    `类型：${item.type === 'duplicate_registration' ? '重复登记' : item.type === 'config_conflict' ? '配置冲突' : '真实占用'}`,
    item.projects.length ? `项目：${item.projects.map((p) => p.name).join('、')}` : '',
    item.processName ? `进程：${item.processName}` : '',
    item.pid ? `PID：${item.pid}` : '',
    item.commandLine ? `命令行：${item.commandLine}` : '',
    `建议：${item.suggestion}`,
    item.recommendedPorts.length ? `推荐可用端口：${item.recommendedPorts.join('、')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
