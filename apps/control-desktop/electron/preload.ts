import { contextBridge, ipcRenderer } from 'electron';

function taskEvents(channel: string, cb: (task: unknown) => void) {
  const handler = (_: unknown, task: unknown) => cb(task);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (data: unknown) => ipcRenderer.invoke('config:save', data),
    setAutoStart: (enabled: boolean) => ipcRenderer.invoke('config:setAutoStart', enabled),
    openLogsDir: () => ipcRenderer.invoke('config:openLogsDir'),
    openConfigDir: () => ipcRenderer.invoke('config:openConfigDir'),
    resetLocalCache: () => ipcRenderer.invoke('config:resetLocalCache'),
  },

  process: {
    list: () => ipcRenderer.invoke('process:list'),
    logs: (id: string) => ipcRenderer.invoke('process:logs', id),
    clearLogs: (id: string) => ipcRenderer.invoke('process:clearLogs', id),
    preflight: (p: unknown) => ipcRenderer.invoke('process:preflight', p),
    start: (p: unknown) => ipcRenderer.invoke('process:start', p),
    stop: (id: string, meta?: unknown) => ipcRenderer.invoke('process:stop', id, meta),
    stopExternal: (payload: unknown) => ipcRenderer.invoke('process:stopExternal', payload),
    restart: (p: unknown) => ipcRenderer.invoke('process:restart', p),
    usage: (id: string) => ipcRenderer.invoke('process:usage', id),
  },

  terminal: {
    write: (projectId: string, data: string) =>
      ipcRenderer.invoke('terminal:write', projectId, data),
    resize: (projectId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', projectId, cols, rows),
    onData: (cb: (payload: { projectId: string; data: string }) => void) => {
      const handler = (_: unknown, payload: { projectId: string; data: string }) => cb(payload);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
  },

  onProcessStatus: (cb: (proc: unknown) => void) => {
    const handler = (_: unknown, proc: unknown) => cb(proc);
    ipcRenderer.on('process:status', handler);
    return () => ipcRenderer.removeListener('process:status', handler);
  },

  ports: {
    local: () => ipcRenderer.invoke('ports:local'),
    localSync: () => ipcRenderer.invoke('ports:localSync'),
    check: (port: number) => ipcRenderer.invoke('ports:check', port),
    inspect4791: () => ipcRenderer.invoke('ports:inspect4791'),
    close4791: () => ipcRenderer.invoke('ports:close4791'),
    analyze: (ignoredIds?: string[]) => ipcRenderer.invoke('ports:analyze', ignoredIds || []),
    safeKill: (opts: { pid: number; projectId: string; port: number; ignoredIds?: string[] }) =>
      ipcRenderer.invoke('ports:safeKill', opts),
  },

  project: {
    webUrl: (p: unknown) => ipcRenderer.invoke('project:webUrl', p),
    healthCheck: (url: string) => ipcRenderer.invoke('health:checkUrl', url),
  },

  health: {
    checkUrl: (url: string) => ipcRenderer.invoke('health:checkUrl', url),
  },

  shell: {
    openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    openGithub: (url: string) => ipcRenderer.invoke('shell:openGithub', url),
  },

  native: {
    status: () => ipcRenderer.invoke('native:status'),
    listWindows: () => ipcRenderer.invoke('native:listWindows'),
    findByProcess: (name: string) => ipcRenderer.invoke('native:findByProcess', name),
    moveWindow: (opts: unknown) => ipcRenderer.invoke('native:moveWindow', opts),
    focusWindow: (hwnd: number) => ipcRenderer.invoke('native:focusWindow', hwnd),
    arrangeQianfan: () => ipcRenderer.invoke('native:arrangeQianfan'),
  },

  webview: {
    open: (id: string, url: string) => ipcRenderer.invoke('webview:open', { id, url }),
  },

  manifest: {
    scanLocal: () => ipcRenderer.invoke('manifest:scanLocal'),
    import: () => ipcRenderer.invoke('manifest:import'),
    dedupePortsPreview: (localPath: string) =>
      ipcRenderer.invoke('manifest:dedupePortsPreview', localPath),
    dedupePortsApply: (localPath: string) =>
      ipcRenderer.invoke('manifest:dedupePortsApply', localPath),
  },

  projects: {
    refresh: () => ipcRenderer.invoke('projects:refresh'),
    rescanDisk: () => ipcRenderer.invoke('projects:rescanDisk'),
    loadLocal: () => ipcRenderer.invoke('projects:loadLocal'),
    detectExternalRunning: () => ipcRenderer.invoke('projects:detectExternalRunning'),
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getAbout: () => ipcRenderer.invoke('app:getAbout'),
  },

  git: {
    list: (opts?: { fetchRemote?: boolean }) => ipcRenderer.invoke('git:list', opts),
    status: (opts: unknown) => ipcRenderer.invoke('git:status', opts),
    commitPush: (opts: unknown) => ipcRenderer.invoke('git:commitPush', opts),
    pull: (localPath: string) => ipcRenderer.invoke('git:pull', localPath),
    ignoredCount: (localPath: string) => ipcRenderer.invoke('git:ignoredCount', localPath),
    githubUrl: (remote?: string) => ipcRenderer.invoke('git:githubUrl', remote),
  },

  steward: {
    healthCheckLight: () => ipcRenderer.invoke('steward:healthCheckLight'),
    healthCheck: () => ipcRenderer.invoke('steward:healthCheck'),
    repair: (action: string) => ipcRenderer.invoke('steward:repair', action),
  },

  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id: string) => ipcRenderer.invoke('tasks:get', id),
    cancel: (id: string) => ipcRenderer.invoke('tasks:cancel', id),
    onProgress: (cb: (task: unknown) => void) => taskEvents('task:progress', cb),
    onDone: (cb: (task: unknown) => void) => taskEvents('task:done', cb),
    onFailed: (cb: (task: unknown) => void) => taskEvents('task:failed', cb),
    onCancelled: (cb: (task: unknown) => void) => taskEvents('task:cancelled', cb),
  },
};

contextBridge.exposeInMainWorld('zhuboDesktop', api);

export type ZhuboDesktopApi = typeof api;
