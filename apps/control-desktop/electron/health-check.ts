import fs from 'fs';
import path from 'path';
import type {
  HealthCheckItem,
  HealthCheckReport,
} from '../../../packages/control-shared/src/steward';
import { cloudClient } from './cloud-client';
import { agentManager } from './agent-manager';
import { testQianfanRelay } from './cookie-sync';
import { inspectLegacy4791Async, closeLegacy4791 } from './port-4791';
import { getScanRoot, scanManifestsLocal, readProjectManifest } from './manifest-scanner';
import { loadConfig } from './config';
import { listGitStatusesAsync, collectGitProjects } from './git-manager';
import { scanManifestFileForbidden } from './forbidden-url';
import { analyzePortConflictsAsync } from './port-conflict-analyzer';
import { loadLocalProjectsFromManifests } from './local-projects';

export type HealthProgress = (step: string, progress: number, message?: string) => void;

const DEFAULT_HEALTH_BY_CODE: Record<string, string> = {
  'zhubo-analysis': 'http://8.137.126.18/api/health',
  'jade-accounting': 'http://8.137.126.18/account/api/health',
};

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
  if (project.code && DEFAULT_HEALTH_BY_CODE[project.code])
    return DEFAULT_HEALTH_BY_CODE[project.code];
  if (project.publicUrl) {
    const base = project.publicUrl.replace(/\/$/, '');
    if (base.includes('/control')) return null;
    return `${base}/api/health`;
  }
  return null;
}

export async function checkCloudHealth(signal?: AbortSignal): Promise<HealthCheckItem> {
  void signal;
  try {
    await cloudClient.ensureLogin();
    return item({
      id: 'cloud_health',
      title: '云端总控 health',
      status: 'ok',
      message: '云端总控正常',
      impact: '影响项目同步、Cookie、端口登记',
      category: 'cloud',
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return item({
      id: 'cloud_health',
      title: '云端总控 health',
      status: 'warn',
      message: '云端未连接，不影响本地功能。',
      category: 'cloud',
    });
  }
}

export function checkAgent(): HealthCheckItem[] {
  const agentSnap = agentManager.getSnapshot();
  return [
    item({
      id: 'agent_online',
      title: '本地 Agent 在线状态',
      status:
        agentSnap.state === 'online' ? 'ok' : agentSnap.state === 'starting' ? 'warn' : 'fixable',
      message: agentSnap.message,
      impact: '影响扫描上传、远程启停',
      repairAction: 'agent:ensure',
      repairable: agentSnap.state !== 'online',
      category: 'agent',
    }),
    item({
      id: 'agent_ws',
      title: 'Agent WebSocket',
      status: agentSnap.cloudOnline && agentSnap.state === 'online' ? 'ok' : 'warn',
      message: agentSnap.cloudOnline ? 'WebSocket 通道可用' : 'Agent 未与云端建立 WS',
      repairAction: 'agent:ensure',
      repairable: agentSnap.state !== 'online',
      category: 'agent',
    }),
  ];
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

export async function checkQianfanCookie(): Promise<HealthCheckItem[]> {
  const items: HealthCheckItem[] = [];
  try {
    const shops = await cloudClient.qianfanShops();
    const canonical = shops.filter((s: { archived?: boolean }) => !s.archived);
    items.push(
      item({
        id: 'qianfan_shops',
        title: '千帆 Cookie 四店',
        status: canonical.length >= 4 ? 'ok' : 'warn',
        message: `有效店铺 ${canonical.length} 个`,
        category: 'cookie',
      }),
    );
    const dashboard = await cloudClient.dashboard();
    const lastUpload = dashboard?.qianfanCookieUpdatedAt as string | undefined;
    if (lastUpload) {
      const ageH = (Date.now() - Date.parse(lastUpload)) / 3600000;
      items.push(
        item({
          id: 'qianfan_cookie_age',
          title: '千帆 Cookie 时效',
          status: ageH <= 3 ? 'ok' : 'warn',
          message:
            ageH <= 3
              ? `${Math.round(ageH * 60)} 分钟前更新`
              : `已超过 ${ageH.toFixed(1)} 小时未更新`,
          repairAction: 'nav:cookies',
          repairable: ageH > 3,
          category: 'cookie',
        }),
      );
    }
  } catch {
    items.push(
      item({
        id: 'qianfan_shops',
        title: '千帆 Cookie',
        status: 'skipped',
        message: '云端未连接',
        category: 'cookie',
      }),
    );
  }
  return items;
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
      const r = await cloudClient.healthCheck(url);
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
  projects: Parameters<typeof listGitStatusesAsync>[0],
  signal?: AbortSignal,
): Promise<HealthCheckItem> {
  try {
    const statuses = await listGitStatusesAsync(projects, {
      fetchRemote: false,
      concurrency: 2,
      signal,
    });
    const unpushed = statuses.filter(
      (g) => g.hasUnpushed || g.state === 'unpushed' || g.state === 'dirty',
    );
    return item({
      id: 'git_unpushed',
      title: 'Git 未 push',
      status: unpushed.length === 0 ? 'ok' : 'warn',
      message: unpushed.length ? `${unpushed.length} 个项目有未 push 改动` : '全部已同步',
      repairAction: 'nav:git',
      repairable: unpushed.length > 0,
      category: 'git',
    });
  } catch {
    return item({
      id: 'git_unpushed',
      title: 'Git 未 push',
      status: 'skipped',
      message: 'Git 快速检查超时，已跳过',
      category: 'git',
    });
  }
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
      status: cfg.controlServerUrl && cfg.scanRoot ? 'ok' : 'warn',
      message:
        cfg.controlServerUrl && cfg.scanRoot ? '配置完整' : '缺少 controlServerUrl 或 scanRoot',
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

/** 简单体检 — 本地优先，云端/Cookie 可选 */
export async function runHealthCheckSimple(signal?: AbortSignal): Promise<HealthCheckReport> {
  const localProjects = loadLocalProjectsFromManifests();
  const items: HealthCheckItem[] = [
    checkLocalManifests(),
    await checkGitQuick(localProjects as Parameters<typeof checkGitQuick>[0], signal),
    await checkPorts(signal),
    checkAgentSimple(),
    await checkCloudOptional(),
    await checkCookieOptional(),
  ];
  return summarize(items);
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
  try {
    await cloudClient.ensureLogin();
    return item({
      id: 'cloud',
      title: '云端连接',
      status: 'ok',
      message: '已连接',
      category: 'cloud',
    });
  } catch {
    return item({
      id: 'cloud',
      title: '云端连接',
      status: 'warn',
      message: '云端未连接，不影响本地功能。',
      repairAction: 'nav:settings',
      repairable: true,
      category: 'cloud',
    });
  }
}

export async function checkCookieOptional(): Promise<HealthCheckItem> {
  const relay = await testQianfanRelay();
  try {
    const data = await cloudClient.qianfanShops().catch(async () => {
      const cfg = loadConfig();
      if (!cfg.serviceToken?.trim()) throw new Error('no token');
      return cloudClient.qianfanShopsWithServiceToken();
    });
    const shops = (data.shops || []) as Array<{
      found?: boolean;
      updatedAt?: string;
      stale?: boolean;
    }>;
    const found = shops.filter((s) => s.found);
    const staleCount = found.filter((s) => s.stale).length;
    const missing = 4 - found.length;

    if (!relay.ok) {
      return item({
        id: 'qianfan_cookie',
        title: 'Cookie 同步',
        status: 'warn',
        message: '千帆中转机器人未运行，自动同步不可用。',
        repairAction: 'nav:cookies',
        repairable: true,
        category: 'cookie',
      });
    }
    if (found.length >= 4 && staleCount === 0) {
      return item({
        id: 'qianfan_cookie',
        title: 'Cookie 同步',
        status: 'ok',
        message: '四店 Cookie 正常。',
        category: 'cookie',
      });
    }
    if (missing > 0) {
      return item({
        id: 'qianfan_cookie',
        title: 'Cookie 同步',
        status: 'warn',
        message: '有店铺 Cookie 未收到，请打开千帆客服台后点立即同步 Cookie。',
        repairAction: 'nav:cookies',
        repairable: true,
        category: 'cookie',
      });
    }
    return item({
      id: 'qianfan_cookie',
      title: 'Cookie 同步',
      status: 'warn',
      message: 'Cookie 太久没更新，建议立即同步。',
      repairAction: 'nav:cookies',
      repairable: true,
      category: 'cookie',
    });
  } catch {
    return item({
      id: 'qianfan_cookie',
      title: 'Cookie 同步',
      status: 'warn',
      message: relay.ok
        ? '连接云端后可查看 Cookie 状态。'
        : '连接云端后可查看 Cookie 状态；千帆中转机器人未运行。',
      repairAction: 'nav:settings',
      repairable: true,
      category: 'cookie',
    });
  }
}

export function checkAgentSimple(): HealthCheckItem {
  const agentSnap = agentManager.getSnapshot();
  let message = agentSnap.message;
  if (/401|403|password|密码|token|credential|unauthorized/i.test(message)) {
    message = '需要重新连接云端（不影响本地基础功能）';
  } else if (agentSnap.state === 'online') {
    message = '本地 Agent 在线';
  } else if (agentSnap.state === 'offline' && !agentSnap.localPid) {
    message = '本地 Agent 未启动';
  }
  return item({
    id: 'agent_online',
    title: '本地 Agent',
    status: agentSnap.state === 'online' ? 'ok' : 'warn',
    message,
    repairAction: 'agent:ensure',
    repairable: agentSnap.state !== 'online',
    category: 'agent',
  });
}

/** 轻量体检 — 页面打开时用 */
export async function runHealthCheckLight(): Promise<HealthCheckReport> {
  const items: HealthCheckItem[] = [
    await checkCloudHealth(),
    ...checkAgent(),
    checkManifests(),
    ...checkExeConfig().slice(1, 2),
  ];
  return summarize(items);
}

/** 完整体检 — 后台任务 */
export async function runHealthCheckFull(
  onProgress?: HealthProgress,
  signal?: AbortSignal,
): Promise<HealthCheckReport> {
  const items: HealthCheckItem[] = [];
  const steps: Array<{ name: string; run: () => Promise<HealthCheckItem | HealthCheckItem[]> }> = [
    { name: '云端 health', run: () => checkCloudHealth(signal) },
    { name: 'Agent', run: async () => checkAgent() },
    { name: 'manifest', run: async () => checkManifests() },
    { name: '端口', run: () => checkPorts(signal) },
    { name: '4791', run: () => checkLegacy4791(signal) },
    { name: '禁用 URL', run: async () => checkForbiddenRuntimeUrls() },
    { name: '千帆 Cookie', run: () => checkQianfanCookie() },
    {
      name: '项目 health',
      run: async () => {
        const projects = await cloudClient.projects().catch(() => []);
        return checkProjectHealth(projects);
      },
    },
    {
      name: 'Git',
      run: async () => {
        const projects = await cloudClient.projects().catch(() => []);
        return checkGitQuick(projects, signal);
      },
    },
    { name: 'EXE 配置', run: async () => checkExeConfig() },
  ];

  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) break;
    const step = steps[i];
    onProgress?.(step.name, Math.round(((i + 1) / steps.length) * 100), `正在检查：${step.name}`);
    try {
      const result = await step.run();
      if (Array.isArray(result)) items.push(...result);
      else items.push(result);
    } catch (e) {
      items.push(
        item({
          id: `step_${i}`,
          title: step.name,
          status: 'skipped',
          message: e instanceof Error ? e.message : '检查失败，已跳过',
          category: 'config',
        }),
      );
    }
  }

  return summarize(items);
}

/** @deprecated 使用 runHealthCheckFull */
export async function runHealthCheck(): Promise<HealthCheckReport> {
  return runHealthCheckFull();
}

export async function runHealthRepair(action: string): Promise<{ ok: boolean; message: string }> {
  switch (action) {
    case 'agent:ensure':
      return agentManager.ensureRunning();
    case 'ports:close4791':
      return closeLegacy4791();
    default:
      return { ok: false, message: `未知修复动作：${action}` };
  }
}

export async function runWorkdayStart(
  onProgress?: HealthProgress,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message: string; report: HealthCheckReport }> {
  onProgress?.('Agent', 10, '检查 Agent…');
  await agentManager.ensureRunning();
  onProgress?.('完整体检', 30, '运行开工体检…');
  const report = await runHealthCheckFull(onProgress, signal);
  const issues = report.items.filter((i) => i.status === 'error' || i.status === 'warn');
  return {
    ok: report.summary.error === 0,
    message: issues.length ? `开工检查完成，${issues.length} 项需关注` : '今日开工检查全部正常',
    report,
  };
}

export async function runWorkdayEnd(
  onProgress?: HealthProgress,
  signal?: AbortSignal,
): Promise<{
  ok: boolean;
  message: string;
  unpushed: Awaited<ReturnType<typeof listGitStatusesAsync>>;
}> {
  const projects = await cloudClient.projects().catch(() => []);
  const items = collectGitProjects(projects);
  const unpushed: Awaited<ReturnType<typeof listGitStatusesAsync>> = [];

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) break;
    const p = items[i];
    onProgress?.(
      'Git',
      Math.round(((i + 1) / items.length) * 100),
      `正在检查 Git ${i + 1}/${items.length}：${p.projectName}`,
    );
    const st = await listGitStatusesAsync(
      [
        {
          code: p.projectCode,
          name: p.projectName,
          localPath: p.localPath,
          gitRemote: p.gitRemote,
        },
      ],
      {
        fetchRemote: false,
        concurrency: 1,
        signal,
      },
    );
    const row = st[0];
    if (row && (row.hasUnpushed || row.state === 'unpushed' || row.state === 'dirty')) {
      unpushed.push(row);
    }
  }

  return {
    ok: unpushed.length === 0,
    message: unpushed.length
      ? `收工提醒：还有 ${unpushed.length} 个项目未 push`
      : '收工检查：Git 已全部同步',
    unpushed,
  };
}
