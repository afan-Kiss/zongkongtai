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

import { scanLocalPorts, isPortListening, checkHealthUrl, inferWebUrl } from './port-manager';
import { inspectLegacy4791, closeLegacy4791 } from './port-4791';
import { buildQianfanShopCards } from './qianfan-shops';

import {
  listWindows,
  findWindowsByProcess,
  moveWindow,
  focusWindow,
  arrangeQianfanWorkspace,
  getHelperStatus,
} from './native-helper-client';

import { WORKSPACES, runWorkspace } from './workspace-manager';

import { getLogDir } from './file-logger';

import { isAutoLaunchEnabled, setAutoLaunch } from './auto-launch';

import { fileLog } from './file-logger';

import { agentManager } from './agent-manager';
import {
  assertAllowedExternalUrl,
  assertAllowedOpenPath,
  assertMoveWindowOptions,
  assertTerminalSession,
  getWindowHwnd,
  pickSafeProjectPayload,
} from './ipc-security';

const webViews = new Map<string, BrowserWindow>();

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
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

    fileLog.app('配置已保存');

    return { ok: true };
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
      const msg = e instanceof Error ? e.message : String(e);

      fileLog.cloud(`连接失败: ${msg}`, 'error');

      return { ok: false, message: msg };
    }
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

  ipcMain.handle('cloud:ports', async () => {
    await cloudClient.ensureLogin();

    const [ports, local] = await Promise.all([
      cloudClient.portConflicts(),
      Promise.resolve(scanLocalPorts()),
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
      return processManager.start(pickSafeProjectPayload(detail as Record<string, unknown>));
    } catch (e) {
      fileLog.process(`启动失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
      throw e;
    }
  });

  ipcMain.handle('process:stop', async (_e, projectId: string) => {
    await processManager.stop(projectId);

    return { ok: true };
  });

  ipcMain.handle('process:restart', async (_e, project: any) => {
    if (!project?.id) throw new Error('缺少项目 ID，无法重启');
    try {
      const detail = await cloudClient.project(project.id);
      return processManager.restart(pickSafeProjectPayload(detail as Record<string, unknown>));
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

  ipcMain.handle('ports:local', () => scanLocalPorts());

  ipcMain.handle('ports:check', (_e, port: number) => isPortListening(port));

  ipcMain.handle('shell:openPath', (_e, p: string) => {
    return shell.openPath(assertAllowedOpenPath(p));
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    return shell.openExternal(assertAllowedExternalUrl(url));
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
    const win = getMainWindow();
    const hwnd = getWindowHwnd(win);
    const result = await arrangeQianfanWorkspace(hwnd);

    fileLog.native(result.messages.join('; '));

    return result;
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

  ipcMain.handle('ports:inspect4791', () => inspectLegacy4791());

  ipcMain.handle('ports:close4791', async () => closeLegacy4791());

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

  ipcMain.handle('app:getPath', (_e, name: string) => {
    if (name === 'userData') return app.getPath('userData');

    if (name === 'exe') return process.execPath;

    return app.getAppPath();
  });
}
