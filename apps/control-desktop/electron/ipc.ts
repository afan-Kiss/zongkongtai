import { ipcMain, BrowserWindow, shell, app } from 'electron';

import path from 'path';

import { cloudClient } from './cloud-client';

import {
  loadConfig,
  saveConfig,
  maskToken,
  getConfigDir,
  getConfigFilePath,
  hasCredentialsSource,
  isConfigComplete,
} from './config';

import { processManager } from './process-manager';

import {
  scanLocalPorts,
  isPortListeningAsync,
  checkHealthUrl,
  inferWebUrl,
  scanLocalPortsAsync,
} from './port-manager';
import { inspectLegacy4791Async, closeLegacy4791 } from './port-4791';
import {
  analyzePortConflictsAsync,
  safeKillPortProcess,
  previewManifestPortDedupe,
  applyManifestPortDedupe,
} from './port-conflict-analyzer';
import { buildQianfanShopCards } from './qianfan-shops';

import {
  listWindows,
  findWindowsByProcess,
  moveWindow,
  focusWindow,
  arrangeQianfanWorkspace,
  getHelperStatus,
} from './native-helper-client';

import { loadLocalProjectsFromManifests } from './local-projects';
import { WORKSPACES, runWorkspace } from './workspace-manager';

import { getLogDir } from './file-logger';

import { isAutoLaunchEnabled, setAutoLaunch } from './auto-launch';

import { fileLog } from './file-logger';

import { agentManager, resolveMonorepoRoot } from './agent-manager';
import {
  scanManifestsLocal,
  getScanRoot,
  enrichProjectsWithManifests,
  runAgentScanCli,
  readProjectManifest,
} from './manifest-scanner';
import {
  getGitStatusForPath,
  gitCommitAndPush,
  gitPullLatest,
  githubUrlFromRemote,
  listGitStatusesAsync,
  countGitIgnoredFiles,
} from './git-manager';
import {
  runHealthCheckLight,
  runHealthCheckFull,
  runHealthCheckSimple,
  runHealthRepair,
  runWorkdayStart,
  runWorkdayEnd,
} from './health-check';
import { taskManager } from './task-manager';
import { wrapIpcHandler } from './ipc-perf';
import {
  assertAllowedExternalUrl,
  assertAllowedGithubUrl,
  assertAllowedOpenPath,
  assertMoveWindowOptions,
  assertTerminalSession,
  assertRiskAllowed,
  getWindowHwnd,
  pickSafeProjectPayload,
} from './ipc-security';

const webViews = new Map<string, BrowserWindow>();

function sendTaskEvent(
  getMainWindow: () => BrowserWindow | null,
  channel: string,
  payload: unknown,
) {
  getMainWindow()?.webContents.send(channel, payload);
}

function assertNotDuplicateTask(type: string, message = '这个任务正在进行中，请稍等。') {
  const running = taskManager
    .list()
    .some((t) => t.type === type && (t.status === 'queued' || t.status === 'running'));
  if (running) throw new Error(message);
}

function ipcPerf<T extends unknown[], R>(channel: string, handler: (...args: T) => Promise<R> | R) {
  ipcMain.handle(channel, wrapIpcHandler(channel, handler));
}

async function resolveProjectForRisk(projectId: string, projectMeta?: unknown) {
  if (projectMeta && typeof projectMeta === 'object') {
    const merged = pickSafeProjectPayload({
      id: projectId,
      ...(projectMeta as Record<string, unknown>),
    });
    if (merged.code || merged.riskLevel) return merged;
  }
  try {
    await cloudClient.ensureLogin();
    const detail = await cloudClient.project(projectId);
    return pickSafeProjectPayload(detail as Record<string, unknown>);
  } catch {
    const managed = processManager.get(projectId);
    if (managed?.cwd) {
      const m = readProjectManifest(managed.cwd);
      if (m) {
        return pickSafeProjectPayload({
          id: projectId,
          name: managed.projectName,
          code: m.code,
          localPath: managed.cwd,
          riskLevel: m.riskLevel,
        });
      }
    }
    throw new Error('无法确认项目风险等级，已阻止操作');
  }
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  taskManager.on('progress', (task) => sendTaskEvent(getMainWindow, 'task:progress', task));
  taskManager.on('done', (task) => sendTaskEvent(getMainWindow, 'task:done', task));
  taskManager.on('failed', (task) => sendTaskEvent(getMainWindow, 'task:failed', task));
  taskManager.on('cancelled', (task) => sendTaskEvent(getMainWindow, 'task:cancelled', task));

  agentManager.on('status', (snap) => {
    getMainWindow()?.webContents.send('agent:status', snap);
  });
  agentManager.startPolling(20000);

  processManager.on('log', ({ projectId, data }) => {
    getMainWindow()?.webContents.send('terminal:data', { projectId, data });
  });

  processManager.on('status', (proc) => {
    getMainWindow()?.webContents.send('process:status', proc);
  });

  ipcMain.handle('config:get', () => {
    const cfg = loadConfig();

    return {
      ...cfg,

      adminPassword: cfg.adminPassword ? '******' : '',

      agentToken: cfg.agentToken ? maskToken(cfg.agentToken) : '',

      serviceToken: cfg.serviceToken ? maskToken(cfg.serviceToken) : '',

      hasAdminPassword: !!cfg.adminPassword,

      hasAgentToken: !!cfg.agentToken,

      hasServiceToken: !!cfg.serviceToken,

      configDir: getConfigDir(),

      configFilePath: getConfigFilePath(),

      logDir: getLogDir(),

      hasCredentialsSource: hasCredentialsSource(),

      configComplete: isConfigComplete(cfg),

      autoStart: isAutoLaunchEnabled(),
    };
  });

  ipcMain.handle('config:save', (_e, partial: Record<string, unknown>) => {
    const current = loadConfig();

    const next = { ...current };

    if (partial.controlServerUrl) next.controlServerUrl = String(partial.controlServerUrl);

    if (partial.adminUsername) next.adminUsername = String(partial.adminUsername);

    if (partial.adminPassword && partial.adminPassword !== '******')
      next.adminPassword = String(partial.adminPassword);

    if (partial.scanRoot) next.scanRoot = String(partial.scanRoot);

    if (partial.agentToken && !String(partial.agentToken).includes('****'))
      next.agentToken = String(partial.agentToken);

    if (partial.serviceToken && !String(partial.serviceToken).includes('****'))
      next.serviceToken = String(partial.serviceToken);

    saveConfig(next);

    cloudClient.refreshConfig();
    cloudClient.clearSession();

    fileLog.app('配置已保存，已清空云端登录缓存');

    return { ok: true };
  });

  ipcMain.handle('config:testLogin', async (_e, partial?: Record<string, unknown>) => {
    const current = loadConfig();
    const username = partial?.adminUsername ? String(partial.adminUsername) : current.adminUsername;
    let password = current.adminPassword;
    if (partial?.adminPassword && partial.adminPassword !== '******') {
      password = String(partial.adminPassword);
    }
    return cloudClient.testLogin(username, password);
  });

  ipcMain.handle('config:setAutoStart', (_e, enabled: boolean) => {
    setAutoLaunch(!!enabled);

    fileLog.app(`开机自启 ${enabled ? '开启' : '关闭'}`);

    return { ok: true, enabled: !!enabled };
  });

  ipcMain.handle('config:openLogsDir', () => shell.openPath(getLogDir()));

  ipcMain.handle('config:openConfigDir', () => shell.openPath(getConfigDir()));

  ipcMain.handle('cloud:connect', async () => {
    try {
      if (!isConfigComplete(loadConfig())) {
        return { ok: false, message: '请先在设置页配置总控地址和登录账号密码' };
      }

      await cloudClient.health();

      await cloudClient.ensureLogin();

      const dash = await cloudClient.dashboard();

      const agents = await cloudClient.agents();

      fileLog.cloud('云端连接成功');

      void agentManager.ensureRunning(true);

      return {
        ok: true,

        message: '云端总控连接成功',

        dashboard: dash,

        agentsOnline: agents.filter((a: any) => a.status === 'online').length,
      };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      fileLog.cloud(`连接失败: ${raw}`, 'error');
      return { ok: false, message: '未连接', detail: raw.slice(0, 200) };
    }
  });

  ipcMain.handle('projects:loadLocal', () => {
    const local = loadLocalProjectsFromManifests();
    return enrichProjectsWithManifests(local as any[]);
  });

  ipcMain.handle('cloud:projects', async () => {
    await cloudClient.ensureLogin();

    return cloudClient.projects();
  });

  ipcMain.handle('cloud:project', async (_e, id: string) => {
    await cloudClient.ensureLogin();

    return cloudClient.project(id);
  });

  ipcMain.handle('cloud:healthCheck', async (_e, url: string) => checkHealthUrl(url));

  ipcPerf('cloud:ports', async () => {
    await cloudClient.ensureLogin();

    const [ports, local] = await Promise.all([
      cloudClient.portConflicts(),
      scanLocalPortsAsync(undefined, true),
    ]);

    return { cloud: ports, local };
  });

  ipcMain.handle('cloud:secrets', async () => {
    await cloudClient.ensureLogin();

    return cloudClient.secrets();
  });

  ipcMain.handle('cloud:dashboard', async () => {
    await cloudClient.ensureLogin();

    return cloudClient.dashboard();
  });

  ipcMain.handle('cloud:agents', async () => {
    await cloudClient.ensureLogin();

    return cloudClient.agents();
  });

  ipcMain.handle('process:list', () => processManager.getAll());

  ipcMain.handle('process:logs', (_e, projectId: string) => processManager.getLogs(projectId));

  ipcMain.handle('process:clearLogs', (_e, projectId: string) => {
    processManager.clearLogs(projectId);

    return { ok: true };
  });

  ipcMain.handle('process:preflight', async (_e, project: any) => {
    if (project?.id && !project.commands) {
      try {
        const detail = await cloudClient.project(project.id);

        return processManager.preflight({ ...project, ...detail });
      } catch {
        /* use list payload */
      }
    }

    return processManager.preflight(project);
  });

  ipcMain.handle('process:start', async (_e, project: any) => {
    if (!project?.id) throw new Error('缺少项目 ID，无法启动');
    try {
      const detail = await cloudClient.project(project.id);
      const payload = pickSafeProjectPayload(detail as Record<string, unknown>);
      assertRiskAllowed(payload, 'start');
      return processManager.start(payload);
    } catch (e) {
      fileLog.process(`启动失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
      throw e;
    }
  });

  ipcMain.handle('process:stop', async (_e, projectId: string, projectMeta?: unknown) => {
    const payload = await resolveProjectForRisk(projectId, projectMeta);
    assertRiskAllowed(payload, 'stop');
    await processManager.stop(projectId, payload);
    return { ok: true };
  });

  ipcMain.handle('process:restart', async (_e, project: any) => {
    if (!project?.id) throw new Error('缺少项目 ID，无法重启');
    try {
      const detail = await cloudClient.project(project.id);
      const payload = pickSafeProjectPayload(detail as Record<string, unknown>);
      assertRiskAllowed(payload, 'restart');
      return processManager.restart(payload);
    } catch (e) {
      throw e;
    }
  });

  ipcMain.handle('process:usage', async (_e, projectId: string) =>
    processManager.getUsage(projectId),
  );

  ipcMain.handle('terminal:write', (_e, projectId: string, data: string) => {
    assertTerminalSession(projectId);
    processManager.write(projectId, data);
  });

  ipcMain.handle('terminal:resize', (_e, projectId: string, cols: number, rows: number) => {
    processManager.resize(projectId, cols, rows);
  });

  ipcPerf('ports:local', () => {
    assertNotDuplicateTask('ports:local');
    return taskManager.startTask('ports:local', '扫描本地端口', async ({ signal, progress }) => {
      progress({ progress: 10, message: '正在扫描端口…' });
      const ports = await scanLocalPortsAsync(signal, true);
      progress({ progress: 100, message: `发现 ${ports.length} 个监听端口` });
      return ports;
    });
  });

  ipcMain.handle('ports:localSync', () => scanLocalPorts());

  ipcMain.handle('ports:check', async (_e, port: number) => isPortListeningAsync(port));

  ipcMain.handle('shell:openPath', (_e, p: string) => {
    return shell.openPath(assertAllowedOpenPath(p));
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    return shell.openExternal(assertAllowedExternalUrl(url));
  });

  ipcMain.handle('shell:openGithub', (_e, url: string) => {
    return shell.openExternal(assertAllowedGithubUrl(url));
  });

  ipcMain.handle('native:status', () => getHelperStatus());

  ipcMain.handle('native:listWindows', async () => {
    try {
      return await listWindows();
    } catch (e) {
      fileLog.native(String(e), 'error');

      throw e;
    }
  });

  ipcMain.handle('native:findByProcess', (_e, name: string) => findWindowsByProcess(name));

  ipcMain.handle('native:moveWindow', (_e, opts: any) => {
    assertMoveWindowOptions(opts);
    return moveWindow(opts);
  });

  ipcMain.handle('native:focusWindow', (_e, hwnd: number | string) => focusWindow(hwnd));

  ipcMain.handle('native:arrangeQianfan', async () => {
    try {
      const win = getMainWindow();
      const hwnd = getWindowHwnd(win);
      const result = await arrangeQianfanWorkspace(hwnd);
      fileLog.native(result.messages.join('; '));
      return result;
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      fileLog.native(`arrangeQianfan failed: ${raw}`, 'warn');
      return {
        ok: false,
        qianfanFound: false,
        messages: ['窗口排列组件不可用，已跳过。你可以手动排列窗口。'],
      };
    }
  });

  ipcMain.handle('workspace:list', () => WORKSPACES);

  ipcMain.handle('workspace:run', async (_e, workspaceId: string) => {
    await cloudClient.ensureLogin();

    const projects = await cloudClient.projects();

    const win = getMainWindow();
    const hwnd = getWindowHwnd(win);

    const steps: any[] = [];

    const result = await runWorkspace(workspaceId, projects, hwnd, (step) => {
      steps.push({ ...step });

      getMainWindow()?.webContents.send('workspace:step', step);
    });

    return { steps: result, live: steps };
  });

  ipcMain.handle('webview:open', (_e, { id, url }: { id: string; url: string }) => {
    const safeUrl = assertAllowedExternalUrl(url);
    const existing = webViews.get(id);

    if (existing && !existing.isDestroyed()) {
      existing.focus();

      existing.loadURL(safeUrl);

      return { ok: true, reused: true };
    }

    const parent = getMainWindow();

    const child = new BrowserWindow({
      width: 1100,

      height: 760,

      parent: parent || undefined,

      modal: false,

      show: true,

      autoHideMenuBar: true,

      webPreferences: {
        partition: `persist:webview-${id}`,

        sandbox: true,

        contextIsolation: true,

        nodeIntegration: false,
      },
    });

    child.webContents.on('render-process-gone', () => {
      if (!child.isDestroyed()) child.close();
    });

    child.on('closed', () => webViews.delete(id));

    child.loadURL(safeUrl);

    webViews.set(id, child);

    return { ok: true };
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:getAbout', () => ({
    version: app.getVersion(),

    exePath: process.execPath,

    configPath: getConfigFilePath(),

    configDir: getConfigDir(),

    logDir: getLogDir(),

    controlServerUrl: loadConfig().controlServerUrl,

    nativeHelper: getHelperStatus(),

    isPackaged: app.isPackaged,

    userData: app.getPath('userData'),
  }));

  ipcMain.handle('cloud:qianfanShops', async (_e, opts?: { includeArchived?: boolean }) => {
    await cloudClient.ensureLogin();
    try {
      return await cloudClient.qianfanShops(!!opts?.includeArchived);
    } catch {
      const secrets = await cloudClient.secrets();
      return { shops: buildQianfanShopCards(secrets as any[]), archived: [] };
    }
  });

  ipcMain.handle('cloud:openSecretsPage', () => {
    const base = loadConfig().controlServerUrl.replace(/\/$/, '');
    return shell.openExternal(assertAllowedExternalUrl(`${base}/secrets`));
  });

  ipcMain.handle('ports:inspect4791', () => inspectLegacy4791Async());

  ipcMain.handle('ports:close4791', async () => closeLegacy4791());

  ipcPerf('ports:analyze', async (_e, ignoredIds: string[] = []) =>
    analyzePortConflictsAsync(ignoredIds),
  );

  ipcMain.handle(
    'ports:safeKill',
    async (_e, opts: { pid: number; projectId: string; port: number; ignoredIds?: string[] }) =>
      safeKillPortProcess(opts.pid, opts.projectId, opts.port, opts.ignoredIds || []),
  );

  ipcMain.handle('manifest:dedupePortsPreview', (_e, localPath: string) =>
    previewManifestPortDedupe(localPath),
  );

  ipcMain.handle('manifest:dedupePortsApply', (_e, localPath: string) =>
    applyManifestPortDedupe(localPath),
  );

  ipcMain.handle('project:webUrl', (_e, project: any) => inferWebUrl(project));

  ipcMain.handle('agent:status', () => agentManager.getSnapshot());

  ipcMain.handle('agent:refresh', () => agentManager.refresh());

  ipcMain.handle('agent:start', () => agentManager.startAgent());

  ipcMain.handle('agent:stop', () => agentManager.stopAgent());

  ipcMain.handle('agent:restart', () => agentManager.restartAgent());

  ipcMain.handle('agent:ensure', () => agentManager.ensureRunning(true));

  ipcMain.handle('agent:openLog', () => {
    const file = agentManager.openAgentLog();
    shell.showItemInFolder(file);
    return file;
  });

  ipcPerf('manifest:scanLocal', () => {
    const root = getScanRoot();
    const { manifests, warnings } = scanManifestsLocal(root);
    return { root, manifests, warnings };
  });

  ipcPerf('manifest:import', async () => {
    await cloudClient.ensureLogin();
    const { manifests, warnings } = scanManifestsLocal(getScanRoot());
    if (!manifests.length) {
      return { ok: false, message: '未找到任何 zhubo-control.manifest.json', warnings };
    }
    const result = await cloudClient.importManifests(manifests);
    fileLog.app(`manifest 导入: +${result.imported} 更新 ${result.updated}`);
    return {
      ok: true,
      ...result,
      warnings: [...warnings, ...(result.warnings || [])],
      message: `导入 ${result.imported} 个，更新 ${result.updated} 个`,
    };
  });

  ipcMain.handle('projects:refresh', async () => {
    try {
      await cloudClient.ensureLogin();
      const projects = await cloudClient.projects();
      return enrichProjectsWithManifests(projects);
    } catch {
      return enrichProjectsWithManifests(loadLocalProjectsFromManifests() as any[]);
    }
  });

  ipcPerf('projects:rescanDisk', async () => {
    await cloudClient.ensureLogin();
    try {
      await cloudClient.requestRescan();
    } catch {
      /* agent may be offline — fall through to CLI */
    }
    const root = resolveMonorepoRoot();
    if (root) {
      const cli = await runAgentScanCli(root);
      if (cli.ok) {
        await new Promise((r) => setTimeout(r, 1500));
        const projects = await cloudClient.projects();
        return { ok: true, message: cli.message, projects: enrichProjectsWithManifests(projects) };
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
    const projects = await cloudClient.projects();
    return {
      ok: true,
      message: '已通知 Agent 扫描，请稍后刷新',
      projects: enrichProjectsWithManifests(projects),
    };
  });

  ipcMain.handle('app:getPath', (_e, name: string) => {
    if (name === 'userData') return app.getPath('userData');

    if (name === 'exe') return process.execPath;

    return app.getAppPath();
  });

  ipcPerf('git:list', async (_e, opts?: { fetchRemote?: boolean }) => {
    assertNotDuplicateTask('git:list');
    let projects: any[] = [];
    try {
      await cloudClient.ensureLogin();
      projects = await cloudClient.projects();
    } catch {
      projects = loadLocalProjectsFromManifests();
    }
    return taskManager.startTask('git:list', '扫描 Git 状态', async ({ signal, progress }) => {
      const results = await listGitStatusesAsync(projects, {
        fetchRemote: !!opts?.fetchRemote,
        concurrency: 2,
        signal,
        onProgress: ({ index, total, status, results: partial }) => {
          progress({
            progress: Math.round((index / total) * 100),
            message: `正在检查 Git ${index}/${total}：${status.projectName}`,
            partial: { results: partial, latest: status },
          });
        },
      });
      return results;
    });
  });

  ipcMain.handle(
    'git:status',
    async (
      _e,
      opts: {
        localPath: string;
        projectCode: string;
        projectName: string;
        gitRemote?: string;
        fetchRemote?: boolean;
      },
    ) => getGitStatusForPath(opts),
  );

  ipcPerf(
    'git:commitPush',
    async (
      _e,
      opts: { localPath: string; message?: string; paths?: string[]; pushOnly?: boolean },
    ) => {
      const taskType = `git:commitPush:${opts.localPath}`;
      assertNotDuplicateTask(taskType, '这个 Git 操作正在进行中，请稍等。');
      return taskManager.startTask(taskType, 'Git 提交并 push', async ({ signal, progress }) => {
        progress({ progress: 20, message: '正在提交…' });
        const result = await gitCommitAndPush(opts, signal);
        progress({ progress: 100, message: result.message });
        return result;
      });
    },
  );

  ipcPerf('git:pull', async (_e, localPath: string) => {
    const taskType = `git:pull:${localPath}`;
    assertNotDuplicateTask(taskType, '这个 Git 操作正在进行中，请稍等。');
    return taskManager.startTask(taskType, 'Git pull', async ({ signal, progress }) => {
      progress({ progress: 30, message: '正在 pull…' });
      return gitPullLatest(localPath, signal);
    });
  });

  ipcMain.handle('git:ignoredCount', async (_e, localPath: string) =>
    countGitIgnoredFiles(localPath),
  );

  ipcMain.handle('git:githubUrl', (_e, remote?: string) => githubUrlFromRemote(remote));

  ipcMain.handle('steward:healthCheckLight', () => runHealthCheckLight());

  ipcPerf('steward:healthCheck', () => {
    assertNotDuplicateTask('steward:healthCheck');
    return taskManager.startTask(
      'steward:healthCheck',
      '系统简单体检',
      async ({ signal, progress }) => runHealthCheckSimple(signal),
    );
  });

  ipcMain.handle('steward:repair', (_e, action: string) => runHealthRepair(action));

  ipcPerf('steward:workdayStart', () => {
    assertNotDuplicateTask('steward:workdayStart');
    return taskManager.startTask('steward:workdayStart', '今日开工', async ({ signal, progress }) =>
      runWorkdayStart(
        (step, pct, msg) => progress({ progress: pct, message: msg || step }),
        signal,
      ),
    );
  });

  ipcPerf('steward:workdayEnd', () => {
    assertNotDuplicateTask('steward:workdayEnd');
    return taskManager.startTask('steward:workdayEnd', '今日收工', async ({ signal, progress }) =>
      runWorkdayEnd((step, pct, msg) => progress({ progress: pct, message: msg || step }), signal),
    );
  });

  ipcMain.handle('tasks:list', () => taskManager.list());
  ipcMain.handle('tasks:get', (_e, id: string) => taskManager.get(id));
  ipcMain.handle('tasks:cancel', (_e, id: string) => taskManager.cancel(id));

  ipcMain.handle('steward:backups', async () => {
    await cloudClient.ensureLogin();
    return cloudClient.stewardBackups();
  });

  ipcPerf('steward:createBackup', async (_e, label?: string) => {
    await cloudClient.ensureLogin();
    return cloudClient.stewardCreateBackup(label);
  });

  ipcPerf('steward:restoreBackup', async (_e, id: string) => {
    await cloudClient.ensureLogin();
    return cloudClient.stewardRestoreBackup(id);
  });

  ipcMain.handle('steward:deployments', async () => {
    await cloudClient.ensureLogin();
    return cloudClient.stewardDeployments();
  });

  ipcMain.handle('steward:tasks', async () => {
    await cloudClient.ensureLogin();
    return cloudClient.stewardTasks();
  });
}
