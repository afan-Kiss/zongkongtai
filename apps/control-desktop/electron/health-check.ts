import fs from 'fs';
import path from 'path';
import type {
  HealthCheckItem,
  HealthCheckReport,
} from '../../../packages/control-shared/src/steward';
import { inspectLegacy4791Async, closeLegacy4791 } from './port-4791';
import { getScanRoot, scanManifestsLocal, readProjectManifest } from './manifest-scanner';
import { loadConfig } from './config';
import { getGitSummaryCache } from './git-manager';
import { analyzePortConflictsAsync } from './port-conflict-analyzer';
import { loadLocalProjectsFromManifests } from './local-projects';
import { detectAllExternalRunning, type DetectableProject } from './external-project-status';
import { validateProjectStartCommand } from './start-command';
import { checkHealthUrl } from './port-manager';
import { scanManifestFileForbidden } from './forbidden-url';

export type HealthProgress = (step: string, progress: number, message?: string) => void;

function item(
  partial: Omit<HealthCheckItem, 'repairable'> & { repairable?: boolean },
): HealthCheckItem {
  return { repairable: false, ...partial };
}

function resolveProjectHealthUrl(project: {
  code?: string;
  publicUrl?: string | null;
  localHealthUrl?: string | null;
  healthUrl?: string | null;
}): string | null {
  if (project.localHealthUrl) return project.localHealthUrl;
  if (project.healthUrl) return project.healthUrl;
  if (project.publicUrl) {
    const base = project.publicUrl.replace(/\/$/, '');
    if (base.includes('/control')) return null;
    return `${base}/api/health`;
  }
  return null;
}

export async function checkCloudHealth(signal?: AbortSignal): Promise<HealthCheckItem> {
  void signal;
  return item({
    id: 'cloud_health',
    title: '云端总控',
    status: 'skipped',
    message: '已移除云端功能，总控为纯本地工具。',
    category: 'cloud',
  });
}

export function checkAgent(): HealthCheckItem[] {
  return [];
}

export function checkManifests(): HealthCheckItem {
  const { manifests, warnings } = scanManifestsLocal();
  return item({
    id: 'manifest_count',
    title: '项目 manifest',
    status: manifests.length >= 11 ? 'ok' : manifests.length >= 5 ? 'warn' : 'error',
    message: `已发现 ${manifests.length} 个 manifest${warnings.length ? `，${warnings.length} 条警告` : ''}`,
    category: 'project',
  });
}

export async function checkPorts(signal?: AbortSignal): Promise<HealthCheckItem> {
  try {
    const analysis = await analyzePortConflictsAsync([], signal);
    const status = analysis.seriousCount > 0 ? 'warn' : analysis.duplicateCount > 0 ? 'ok' : 'ok';
    return item({
      id: 'ports',
      title: '端口冲突',
      status,
      message: analysis.healthMessage,
      repairAction:
        analysis.seriousCount > 0 || analysis.duplicateCount > 0
          ? 'dialog:portConflicts'
          : undefined,
      repairable: analysis.seriousCount > 0 || analysis.duplicateCount > 0,
      category: 'project',
    });
  } catch {
    return item({
      id: 'ports',
      title: '端口冲突',
      status: 'skipped',
      message: '端口扫描超时，已跳过',
      category: 'project',
    });
  }
}

export async function checkLegacy4791(signal?: AbortSignal): Promise<HealthCheckItem> {
  const legacy4791 = await inspectLegacy4791Async(signal);
  return item({
    id: 'legacy_4791',
    title: '本地 4791 遗留进程',
    status: legacy4791.listening ? 'warn' : 'ok',
    message: legacy4791.listening
      ? `4791 被占用：${legacy4791.processName || legacy4791.pid}`
      : '4791 未占用',
    repairAction: 'ports:close4791',
    repairable: legacy4791.listening,
    category: 'infra',
  });
}

export function checkForbiddenRuntimeUrls(): HealthCheckItem {
  const scanRoot = getScanRoot();
  let badConfigCount = 0;
  const samples: string[] = [];
  if (fs.existsSync(scanRoot)) {
    for (const ent of fs.readdirSync(scanRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const manifestPath = path.join(scanRoot, ent.name, 'zhubo-control.manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      const bad = scanManifestFileForbidden(fs.readFileSync(manifestPath, 'utf8'));
      if (bad.length) {
        badConfigCount++;
        samples.push(...bad.slice(0, 2));
      }
    }
  }
  return item({
    id: 'forbidden_urls',
    title: '域名 / wss 正式配置',
    status: badConfigCount ? 'error' : 'ok',
    message: badConfigCount
      ? `发现 ${badConfigCount} 个 manifest 运行 URL 不合规${samples[0] ? `（如 ${samples[0]}）` : ''}`
      : '未发现禁用域名（GitHub remote 已排除）',
    category: 'config',
  });
}

export async function checkProjectHealth(
  projects: Array<{
    code?: string;
    name?: string;
    publicUrl?: string | null;
    localHealthUrl?: string | null;
    healthUrl?: string | null;
  }>,
): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  const targets = projects.filter((p) =>
    ['zhubo-analysis', 'jade-accounting', 'jade-scan', 'xiangyu-system'].includes(p.code || ''),
  );

  for (const p of targets) {
    const url = resolveProjectHealthUrl(p);
    if (!url) {
      items.push(
        item({
          id: `health_${p.code}`,
          title: `${p.name || p.code} health`,
          status: 'skipped',
          message: '未配置 health URL',
          category: 'project',
        }),
      );
      continue;
    }
    try {
      const r = await checkHealthUrl(url);
      items.push(
        item({
          id: `health_${p.code}`,
          title: `${p.name || p.code} health`,
          status: r.ok ? 'ok' : 'warn',
          message: r.ok ? `健康检查通过 (${url})` : r.message || `health 失败 (${url})`,
          category: 'project',
        }),
      );
    } catch (e) {
      items.push(
        item({
          id: `health_${p.code}`,
          title: `${p.name || p.code} health`,
          status: 'warn',
          message: e instanceof Error ? e.message : String(e),
          category: 'project',
        }),
      );
    }
  }
  return items;
}

export async function checkGitQuick(
  _projects: unknown[],
  signal?: AbortSignal,
): Promise<HealthCheckItem> {
  void projects;
  void signal;
  const cached = getGitSummaryCache();
  if (!cached) {
    return item({
      id: 'git_unpushed',
      title: 'Git 状态',
      status: 'ok',
      message: '未检查（可在总览点击「检查 Git」）',
      category: 'git',
    });
  }
  return item({
    id: 'git_unpushed',
    title: 'Git 状态',
    status: cached.unpushedCount === 0 ? 'ok' : 'warn',
    message:
      cached.unpushedCount === 0
        ? `已检查：${cached.total} 个项目均已同步`
        : `已检查：${cached.unpushedCount} 个项目有未上传改动`,
    repairAction: cached.unpushedCount > 0 ? 'nav:git' : undefined,
    repairable: cached.unpushedCount > 0,
    category: 'git',
  });
}

function checkStartCommandValidity(projects: Array<Record<string, unknown>>): HealthCheckItem {
  const issues: string[] = [];
  let okCount = 0;
  for (const p of projects) {
    const v = validateProjectStartCommand(p as Parameters<typeof validateProjectStartCommand>[0]);
    if (v.ok) {
      okCount += 1;
    } else {
      issues.push(`${p.name}: ${v.message}`);
    }
  }
  return item({
    id: 'start_command',
    title: '启动命令有效性',
    status: issues.length === 0 ? 'ok' : 'warn',
    message: issues.length
      ? `${issues.length} 个项目需关注：${issues.slice(0, 3).join('；')}${issues.length > 3 ? '…' : ''}`
      : `${okCount} 个项目启动命令有效`,
    category: 'project',
  });
}

export function checkExeConfig(): HealthCheckItem[] {
  const cfg = loadConfig();
  const { manifests } = scanManifestsLocal();
  const incomplete = manifests.filter(
    (m) => !m.code || !m.name || !(m.ports?.length || m.services?.length),
  );
  return [
    item({
      id: 'prod_db_path',
      title: '生产 DB 路径',
      status: 'ok',
      message: '应为 apps/control-server/prod.db（部署脚本已固定）',
      category: 'infra',
    }),
    item({
      id: 'exe_config',
      title: 'EXE 配置完整性',
      status: cfg.scanRoot ? 'ok' : 'warn',
      message: cfg.scanRoot ? '扫描根目录已配置' : '请在设置中配置扫描根目录',
      category: 'config',
    }),
    item({
      id: 'manifest_fields',
      title: 'manifest 字段完整性',
      status: incomplete.length === 0 ? 'ok' : 'warn',
      message: incomplete.length ? `${incomplete.length} 个 manifest 缺端口/服务` : '字段完整',
      category: 'config',
    }),
  ];
}

function summarize(items: HealthCheckItem[]): HealthCheckReport {
  return {
    checkedAt: new Date().toISOString(),
    summary: {
      ok: items.filter((i) => i.status === 'ok').length,
      warn: items.filter((i) => i.status === 'warn').length,
      error: items.filter((i) => i.status === 'error').length,
      fixable: items.filter((i) => i.repairable).length,
    },
    items,
  };
}

/** 简单体检 — 纯本地，不含 Cookie / 云端 */
export async function runHealthCheckSimple(signal?: AbortSignal): Promise<HealthCheckReport> {
  const localProjects = loadLocalProjectsFromManifests();
  const cfg = loadConfig();
  const items: HealthCheckItem[] = [
    checkLocalManifests(),
    checkStartCommandValidity(localProjects),
    checkGitQuick(localProjects as Parameters<typeof checkGitQuick>[0], signal),
    await checkPorts(signal),
    item({
      id: 'exe_config',
      title: '本地 EXE 配置',
      status: cfg.scanRoot?.trim() ? 'ok' : 'warn',
      message: cfg.scanRoot?.trim() ? '扫描根目录已配置' : '请在设置中配置扫描根目录',
      repairAction: cfg.scanRoot?.trim() ? undefined : 'nav:settings',
      repairable: !cfg.scanRoot?.trim(),
      category: 'config',
    }),
    await checkExternalRunningRecognition(),
  ];
  return summarize(items);
}

async function checkExternalRunningRecognition(): Promise<HealthCheckItem> {
  const projects = loadLocalProjectsFromManifests() as DetectableProject[];
  const results = await detectAllExternalRunning(projects);
  const external = results.filter((r) => r.status === 'external-running');
  const names = external.map((r) => r.projectName).join('、');
  return item({
    id: 'external_running',
    title: '外部运行项目识别',
    status: 'ok',
    message: external.length
      ? `检测到 ${external.length} 个外部运行项目：${names}。`
      : '暂无外部运行项目。',
    category: 'project',
  });
}

async function checkLocalProjectHealth(
  projects: Array<{
    code?: string;
    name?: string;
    localHealthUrl?: string | null;
    healthUrl?: string | null;
  }>,
): Promise<HealthCheckItem[]> {
  const targets = projects.filter((p) =>
    ['zhubo-analysis', 'jade-accounting', 'jade-scan', 'xiangyu-system'].includes(p.code || ''),
  );
  return checkProjectHealth(targets);
}

export function checkLocalManifests(): HealthCheckItem {
  const { manifests, warnings } = scanManifestsLocal();
  return item({
    id: 'local_manifest',
    title: '本地项目扫描',
    status: manifests.length >= 1 ? 'ok' : 'warn',
    message: manifests.length
      ? `已发现 ${manifests.length} 个本地项目${warnings.length ? `，${warnings.length} 条警告` : ''}`
      : '未扫描到 manifest，请检查设置里的扫描根目录',
    category: 'project',
  });
}

export async function checkCloudOptional(): Promise<HealthCheckItem> {
  return item({
    id: 'cloud',
    title: '云端连接',
    status: 'skipped',
    message: '已移除云端功能',
    category: 'cloud',
  });
}

export function checkAgentSimple(): HealthCheckItem {
  return item({
    id: 'agent_online',
    title: '本地 Agent',
    status: 'skipped',
    message: '已移除 Agent 云端功能',
    category: 'agent',
  });
}

/** 轻量体检 — 与简单体检一致 */
export async function runHealthCheckLight(): Promise<HealthCheckReport> {
  return runHealthCheckSimple();
}

/** 完整体检 — 本地简化版 */
export async function runHealthCheckFull(
  _onProgress?: HealthProgress,
  signal?: AbortSignal,
): Promise<HealthCheckReport> {
  return runHealthCheckSimple(signal);
}

/** @deprecated 使用 runHealthCheckFull */
export async function runHealthCheck(): Promise<HealthCheckReport> {
  return runHealthCheckFull();
}

export async function runHealthRepair(action: string): Promise<{ ok: boolean; message: string }> {
  switch (action) {
    case 'agent:ensure':
      return { ok: false, message: '该功能已移除，总控现在是纯本地工具。' };
    case 'ports:close4791':
      return closeLegacy4791();
    default:
      return { ok: false, message: `未知修复动作：${action}` };
  }
}
