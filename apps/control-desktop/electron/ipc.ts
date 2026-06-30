/** 本地总控 IPC — 仅本地项目 / Git / 端口 / 进程，无 cloud / agent / workspace */
import { ipcMain, BrowserWindow, shell, app } from 'electron';
import path from 'path';
import {
  loadConfig,
  saveConfig,
  getConfigDir,
  getConfigFilePath,
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
import {
  listWindows,
  findWindowsByProcess,
  moveWindow,
  focusWindow,
  arrangeQianfanWorkspace,
  getHelperStatus,
} from './native-helper-client';

import { loadLocalProjectsFromManifests, findLocalProjectById } from './local-projects';
import {
  detectAllExternalRunning,
  detectExternalProjectStatus,
  isQianfanRelayProject,
  type DetectableProject,
} from './external-project-status';
import { canStopExternalProcess, stopExternalProcess } from './external-process-stop';

import { getLogDir } from './file-logger';

import { isAutoLaunchEnabled, setAutoLaunch } from './auto-launch';

import { fileLog } from './file-logger';

import {
  scanManifestsLocal,
  getScanRoot,
  enrichProjectsWithManifests,
  readProjectManifest,
} from './manifest-scanner';
import {
  getGitStatusForPath,
  gitCommitAndPush,
  gitPullLatest,
  githubUrlFromRemote,
  listGitStatusesAsync,
  countGitIgnoredFiles,
  setGitSummaryCache,
} from './git-manager';
import { runHealthCheckLight, runHealthCheckSimple, runHealthRepair } from './health-check';
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

function localProjectsList() {
  return enrichProjectsWithManifests(loadLocalProjectsFromManifests() as any[]);
}

function resolveLocalProjectPayload(project: { id?: string; code?: string }) {
  const local =
    (project.id ? findLocalProjectById(project.id) : null) ||
    (project.code ? findLocalProjectById(`local-${project.code}`) : null) ||
    (project.code ? findLocalProjectById(String(project.code)) : null);
  if (!local) return null;
  return pickSafeProjectPayload(local as Record<string, unknown>);
}

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
  const local = findLocalProjectById(projectId);
  if (local) return pickSafeProjectPayload(local as Record<string, unknown>);
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
  throw new Error('无法确认项目信息，已阻止操作');
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  taskManager.on('progress', (task) => sendTaskEvent(getMainWindow, 'task:progress', task));
  taskManager.on('done', (task) => sendTaskEvent(getMainWindow, 'task:done', task));
  taskManager.on('failed', (task) => sendTaskEvent(getMainWindow, 'task:failed', task));
  taskManager.on('cancelled', (task) => sendTaskEvent(getMainWindow, 'task:cancelled', task));

  processManager.on('log', ({ projectId, data }) => {
    getMainWindow()?.webContents.send('terminal:data', { projectId, data });
  });

  processManager.on('status', (proc) => {
    getMainWindow()?.webContents.send('process:status', proc);
  });

  ipcMain.handle('config:get', () => {
    const cfg = loadConfig();

    return {
      scanRoot: cfg.scanRoot,
      configDir: getConfigDir(),
      configFilePath: getConfigFilePath(),
      logDir: getLogDir(),
      configComplete: isConfigComplete(cfg),
      autoStart: isAutoLaunchEnabled(),
    };
  });

  ipcMain.handle('config:save', (_e, partial: Record<string, unknown>) => {
    const current = loadConfig();
    const next = { ...current };
    if (partial.scanRoot) next.scanRoot = String(partial.scanRoot);
    saveConfig(next);
    fileLog.app('本地配置已保存');
    return { ok: true };
  });

  ipcMain.handle('config:resetLocalCache', () => {
    return { ok: true, message: '本地缓存已重置，请重新扫描项目' };
  });

  ipcMain.handle('health:checkUrl', async (_e, url: string) => checkHealthUrl(url));

  ipcMain.handle('config:setAutoStart', (_e, enabled: boolean) => {
    setAutoLaunch(!!enabled);

    fileLog.app(`开机自启 ${enabled ? '开启' : '关闭'}`);

    return { ok: true, enabled: !!enabled };
  });

  ipcMain.handle('config:openLogsDir', () => shell.openPath(getLogDir()));

  ipcMain.handle('config:openConfigDir', () => shell.openPath(getConfigDir()));

  ipcMain.handle('projects:loadLocal', () => {
    const local = loadLocalProjectsFromManifests();
    return enrichProjectsWithManifests(local as any[]);
  });

  ipcMain.handle('projects:detectExternalRunning', async () => {
    const projects = loadLocalProjectsFromManifests() as DetectableProject[];
    const detected = await detectAllExternalRunning(projects);
    const rows = [];
    for (const r of detected.filter(
      (x) => x.status === 'running' || x.status === 'external-running',
    )) {
      if (r.status === 'running') {
        const m = processManager.get(r.projectId);
        if (!m) continue;
        rows.push({
          projectId: m.projectId,
          projectName: m.projectName,
          command: m.command,
          cwd: m.cwd,
          status: 'running' as const,
          pid: m.pid,
        });
        continue;
      }
      const proj = projects.find((p) => p.id === r.projectId) as DetectableProject & {
        desktopStartCommand?: string | null;
        startCommand?: string | null;
        devCommand?: string | null;
      };
      const stopCheck = proj
        ? await canStopExternalProcess(proj, r)
        : { canStop: false, reason: 'no-project' };
      rows.push({
        projectId: r.projectId,
        projectName: r.projectName,
        command: r.message || '',
        cwd: proj?.localPath || '',
        status: 'external-running' as const,
        pid: stopCheck.pid ?? r.pid,
        externalSource: r.source,
        canStopExternal: stopCheck.canStop,
        externalStopHint: stopCheck.canStop
          ? undefined
          : stopCheck.reason === 'no-pid'
            ? '已检测到外部运行，但暂时拿不到进程号，请在原窗口关闭。'
            : undefined,
      });
    }
    return rows;
  });

  ipcMain.handle('process:list', () => processManager.getAll());

  ipcMain.handle('process:logs', (_e, projectId: string) => processManager.getLogs(projectId));

  ipcMain.handle('process:clearLogs', (_e, projectId: string) => {
    processManager.clearLogs(projectId);

    return { ok: true };
  });

  ipcMain.handle('process:preflight', async (_e, project: any) => {
    const local = resolveLocalProjectPayload(project || {});
    return processManager.preflight(local || project);
  });

  ipcMain.handle('process:start', async (_e, project: any) => {
    if (!project?.id) throw new Error('缺少项目 ID，无法启动');
    const local =
      findLocalProjectById(project.id) ||
      (project.code ? findLocalProjectById(String(project.code)) : null);
    const payload = pickSafeProjectPayload((local || project) as Record<string, unknown>);
    assertRiskAllowed(payload, 'start');
    const managed = await processManager.start(payload);
    if (isQianfanRelayProject(payload)) {
      await new Promise((r) => setTimeout(r, 4500));
      const fresh = processManager.get(payload.id);
      if (fresh?.startupWarning) {
        return { ...managed, startupWarning: fresh.startupWarning };
      }
    }
    return managed;
  });

  ipcMain.handle('process:stop', async (_e, projectId: string, projectMeta?: unknown) => {
    const payload = await resolveProjectForRisk(projectId, projectMeta);
    assertRiskAllowed(payload, 'stop');
    await processManager.stop(projectId, payload);
    return { ok: true };
  });

  ipcMain.handle('process:stopExternal', async (_e, payload: unknown) => {
    const body = payload as {
      projectId?: string;
      project?: DetectableProject & {
        desktopStartCommand?: string | null;
        startCommand?: string | null;
        devCommand?: string | null;
      };
      pid?: number;
      source?: string;
    };
    if (!body?.projectId || !body?.project) throw new Error('缺少项目信息');
    const result = await stopExternalProcess({
      projectId: body.projectId,
      project: body.project,
      pid: body.pid,
      source: body.source,
    });
    if (!result.ok) throw new Error(result.message);
    return result;
  });

  ipcMain.handle('process:restart', async (_e, project: any) => {
    if (!project?.id) throw new Error('缺少项目 ID，无法重启');
    const payload = resolveLocalProjectPayload(project);
    if (!payload) throw new Error('未找到本地项目，请先刷新项目列表。');
    assertRiskAllowed(payload, 'restart');

    const external = await detectExternalProjectStatus(payload as DetectableProject);
    if (external.status === 'external-running') {
      throw new Error('项目在外部运行，请先结束外部进程再启动');
    }

    const managed = processManager.get(project.id);
    if (managed?.status === 'running' || managed?.status === 'starting') {
      await processManager.stop(project.id, payload);
      await new Promise((r) => setTimeout(r, 600));
    }

    const started = await processManager.start(payload);
    if (isQianfanRelayProject(payload)) {
      await new Promise((r) => setTimeout(r, 4500));
      const fresh = processManager.get(payload.id);
      if (fresh?.startupWarning) {
        return { ...started, startupWarning: fresh.startupWarning };
      }
    }
    return started;
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

    nativeHelper: getHelperStatus(),

    isPackaged: app.isPackaged,

    userData: app.getPath('userData'),
  }));

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

  ipcPerf('manifest:scanLocal', () => {
    const root = getScanRoot();
    const { manifests, warnings } = scanManifestsLocal(root);
    return { root, manifests, warnings };
  });

  ipcPerf('manifest:import', async () => {
    const { manifests, warnings } = scanManifestsLocal(getScanRoot());
    if (!manifests.length) {
      return { ok: false, message: '未找到任何 zhubo-control.manifest.json', warnings };
    }
    fileLog.app(`本地 manifest 扫描: ${manifests.length} 个`);
    return {
      ok: true,
      imported: 0,
      updated: manifests.length,
      warnings,
      message: `本地扫描完成，发现 ${manifests.length} 个项目`,
    };
  });

  ipcMain.handle('projects:refresh', async () => localProjectsList());

  ipcPerf('projects:rescanDisk', async () => {
    const root = getScanRoot();
    const { manifests, warnings } = scanManifestsLocal(root);
    const projects = localProjectsList();
    return {
      ok: manifests.length > 0,
      message: manifests.length
        ? `已扫描 ${manifests.length} 个本地项目`
        : '未找到 manifest，请检查扫描根目录',
      warnings,
      projects,
    };
  });

  ipcMain.handle('app:getPath', (_e, name: string) => {
    if (name === 'userData') return app.getPath('userData');

    if (name === 'exe') return process.execPath;

    return app.getAppPath();
  });

  ipcPerf('git:list', async (_e, opts?: { fetchRemote?: boolean }) => {
    assertNotDuplicateTask('git:list');
    const projects = loadLocalProjectsFromManifests();
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
      setGitSummaryCache(results);
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

  ipcMain.handle('tasks:list', () => taskManager.list());
  ipcMain.handle('tasks:get', (_e, id: string) => taskManager.get(id));
  ipcMain.handle('tasks:cancel', (_e, id: string) => taskManager.cancel(id));
}
