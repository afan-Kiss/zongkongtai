import fs from 'fs';
import path from 'path';
import type { HealthCheckItem, HealthCheckReport } from '../../../packages/control-shared/src/steward';
import { cloudClient } from './cloud-client';
import { agentManager } from './agent-manager';
import { inspectLegacy4791, closeLegacy4791 } from './port-4791';
import { getScanRoot, scanManifestsLocal } from './manifest-scanner';
import { loadConfig } from './config';
import { listGitStatuses } from './git-manager';

const FORBIDDEN_DOMAIN_RE = /xiangyuzhubao\.xyz|https:\/\/|wss:\/\//i;

function item(
  partial: Omit<HealthCheckItem, 'repairable'> & { repairable?: boolean },
): HealthCheckItem {
  return { repairable: false, ...partial };
}

export async function runHealthCheck(): Promise<HealthCheckReport> {
  const items: HealthCheckItem[] = [];
  const cfg = loadConfig();

  try {
    const conn = await cloudClient.connect();
    items.push(
      item({
        id: 'cloud_health',
        title: '云端总控 health',
        status: conn.ok ? 'ok' : 'error',
        message: conn.ok ? '云端总控正常' : conn.message || '无法连接云端',
        impact: '影响项目同步、Cookie、端口登记',
        category: 'cloud',
      }),
    );
  } catch (e) {
    items.push(
      item({
        id: 'cloud_health',
        title: '云端总控 health',
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
        category: 'cloud',
      }),
    );
  }

  const agentSnap = agentManager.getSnapshot();
  items.push(
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
  );
  items.push(
    item({
      id: 'agent_ws',
      title: 'Agent WebSocket',
      status: agentSnap.cloudOnline && agentSnap.state === 'online' ? 'ok' : 'warn',
      message: agentSnap.cloudOnline ? 'WebSocket 通道可用' : 'Agent 未与云端建立 WS',
      repairAction: 'agent:ensure',
      repairable: agentSnap.state !== 'online',
      category: 'agent',
    }),
  );

  const { manifests, warnings } = scanManifestsLocal();
  items.push(
    item({
      id: 'manifest_count',
      title: '项目 manifest',
      status: manifests.length >= 11 ? 'ok' : manifests.length >= 5 ? 'warn' : 'error',
      message: `已发现 ${manifests.length} 个 manifest${warnings.length ? `，${warnings.length} 条警告` : ''}`,
      category: 'project',
    }),
  );

  try {
    const ports = await cloudClient.ports();
    const conflicts = ports.filter(
      (p: { conflictLevel?: string }) => p.conflictLevel === 'conflict',
    );
    items.push(
      item({
        id: 'port_conflicts',
        title: '端口冲突',
        status: conflicts.length === 0 ? 'ok' : 'warn',
        message: conflicts.length ? `${conflicts.length} 个端口冲突` : '无严重冲突',
        category: 'project',
      }),
    );
  } catch {
    items.push(
      item({
        id: 'port_conflicts',
        title: '端口冲突',
        status: 'skipped',
        message: '云端未连接，跳过',
        category: 'project',
      }),
    );
  }

  const legacy4791 = await inspectLegacy4791();
  items.push(
    item({
      id: 'legacy_4791',
      title: '本地 4791 遗留进程',
      status: legacy4791.listening ? 'warn' : 'ok',
      message: legacy4791.listening
        ? `4791 被占用：${legacy4791.processName || legacy4791.pid}`
        : '4791 未占用',
      repairAction: 'ports:close4791',
      repairable: legacy4791.listening,
      category: 'infra',
    }),
  );

  const scanRoot = getScanRoot();
  let badConfigCount = 0;
  if (fs.existsSync(scanRoot)) {
    for (const ent of fs.readdirSync(scanRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const manifestPath = path.join(scanRoot, ent.name, 'zhubo-control.manifest.json');
      if (
        fs.existsSync(manifestPath) &&
        FORBIDDEN_DOMAIN_RE.test(fs.readFileSync(manifestPath, 'utf8'))
      ) {
        badConfigCount++;
      }
    }
  }
  items.push(
    item({
      id: 'forbidden_urls',
      title: '域名 / wss 正式配置',
      status: badConfigCount ? 'error' : 'ok',
      message: badConfigCount ? `发现 ${badConfigCount} 个 manifest 含禁用域名` : '未发现禁用域名',
      category: 'config',
    }),
  );

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

  for (const t of [
    {
      code: 'zhubo-analysis',
      label: '主播分析',
      url: 'http://8.137.126.18/live-business-api/api/health',
    },
    { code: 'jade-accounting', label: '记账', url: 'http://8.137.126.18/account/api/health' },
  ]) {
    try {
      const r = await cloudClient.healthCheck(t.url);
      items.push(
        item({
          id: `health_${t.code}`,
          title: `${t.label} health`,
          status: r.ok ? 'ok' : 'error',
          message: r.ok ? '健康检查通过' : r.message || 'health 失败',
          category: 'project',
        }),
      );
    } catch (e) {
      items.push(
        item({
          id: `health_${t.code}`,
          title: `${t.label} health`,
          status: 'error',
          message: e instanceof Error ? e.message : String(e),
          category: 'project',
        }),
      );
    }
  }

  try {
    const projects = await cloudClient.projects();
    const unpushed = listGitStatuses(projects).filter(
      (g) => g.hasUnpushed || g.state === 'unpushed' || g.state === 'dirty',
    );
    items.push(
      item({
        id: 'git_unpushed',
        title: 'Git 未 push',
        status: unpushed.length === 0 ? 'ok' : 'warn',
        message: unpushed.length ? `${unpushed.length} 个项目有未 push 改动` : '全部已同步',
        repairAction: 'nav:git',
        repairable: unpushed.length > 0,
        category: 'git',
      }),
    );
  } catch {
    /* skip */
  }

  items.push(
    item({
      id: 'prod_db_path',
      title: '生产 DB 路径',
      status: 'ok',
      message: '应为 apps/control-server/prod.db（部署脚本已固定）',
      category: 'infra',
    }),
  );

  items.push(
    item({
      id: 'exe_config',
      title: 'EXE 配置完整性',
      status: cfg.controlServerUrl && cfg.scanRoot ? 'ok' : 'warn',
      message:
        cfg.controlServerUrl && cfg.scanRoot ? '配置完整' : '缺少 controlServerUrl 或 scanRoot',
      category: 'config',
    }),
  );

  const incomplete = manifests.filter(
    (m) => !m.code || !m.name || !(m.ports?.length || m.services?.length),
  );
  items.push(
    item({
      id: 'manifest_fields',
      title: 'manifest 字段完整性',
      status: incomplete.length === 0 ? 'ok' : 'warn',
      message: incomplete.length ? `${incomplete.length} 个 manifest 缺端口/服务` : '字段完整',
      category: 'config',
    }),
  );

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

export async function runWorkdayStart(): Promise<{
  ok: boolean;
  message: string;
  report: HealthCheckReport;
}> {
  await agentManager.ensureRunning();
  const report = await runHealthCheck();
  const issues = report.items.filter((i) => i.status === 'error' || i.status === 'warn');
  return {
    ok: report.summary.error === 0,
    message: issues.length ? `开工检查完成，${issues.length} 项需关注` : '今日开工检查全部正常',
    report,
  };
}

export async function runWorkdayEnd(): Promise<{
  ok: boolean;
  message: string;
  unpushed: ReturnType<typeof listGitStatuses>;
}> {
  const projects = await cloudClient.projects().catch(() => []);
  const unpushed = listGitStatuses(projects).filter(
    (g) => g.hasUnpushed || g.state === 'unpushed' || g.state === 'dirty',
  );
  return {
    ok: unpushed.length === 0,
    message: unpushed.length
      ? `收工提醒：还有 ${unpushed.length} 个项目未 push`
      : '收工检查：Git 已全部同步',
    unpushed,
  };
}
