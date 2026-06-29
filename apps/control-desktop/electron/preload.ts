import { contextBridge, ipcRenderer } from 'electron';

const api = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),

    save: (data: unknown) => ipcRenderer.invoke('config:save', data),

    setAutoStart: (enabled: boolean) => ipcRenderer.invoke('config:setAutoStart', enabled),

    openLogsDir: () => ipcRenderer.invoke('config:openLogsDir'),

    openConfigDir: () => ipcRenderer.invoke('config:openConfigDir'),
  },

  cloud: {
    connect: () => ipcRenderer.invoke('cloud:connect'),

    projects: () => ipcRenderer.invoke('cloud:projects'),

    project: (id: string) => ipcRenderer.invoke('cloud:project', id),

    healthCheck: (url: string) => ipcRenderer.invoke('cloud:healthCheck', url),

    ports: () => ipcRenderer.invoke('cloud:ports'),

    secrets: () => ipcRenderer.invoke('cloud:secrets'),

    dashboard: () => ipcRenderer.invoke('cloud:dashboard'),

    agents: () => ipcRenderer.invoke('cloud:agents'),

    qianfanShops: (includeArchived?: boolean) =>
      ipcRenderer.invoke('cloud:qianfanShops', { includeArchived }),

    openSecretsPage: () => ipcRenderer.invoke('cloud:openSecretsPage'),
  },

  process: {
    list: () => ipcRenderer.invoke('process:list'),

    logs: (id: string) => ipcRenderer.invoke('process:logs', id),

    clearLogs: (id: string) => ipcRenderer.invoke('process:clearLogs', id),

    preflight: (p: unknown) => ipcRenderer.invoke('process:preflight', p),

    start: (p: unknown) => ipcRenderer.invoke('process:start', p),

    stop: (id: string) => ipcRenderer.invoke('process:stop', id),

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

    check: (port: number) => ipcRenderer.invoke('ports:check', port),

    inspect4791: () => ipcRenderer.invoke('ports:inspect4791'),

    close4791: () => ipcRenderer.invoke('ports:close4791'),
  },

  project: {
    webUrl: (p: unknown) => ipcRenderer.invoke('project:webUrl', p),
  },

  shell: {
    openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),

    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  native: {
    status: () => ipcRenderer.invoke('native:status'),

    listWindows: () => ipcRenderer.invoke('native:listWindows'),

    findByProcess: (name: string) => ipcRenderer.invoke('native:findByProcess', name),

    moveWindow: (opts: unknown) => ipcRenderer.invoke('native:moveWindow', opts),

    focusWindow: (hwnd: number) => ipcRenderer.invoke('native:focusWindow', hwnd),

    arrangeQianfan: () => ipcRenderer.invoke('native:arrangeQianfan'),
  },

  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),

    run: (id: string) => ipcRenderer.invoke('workspace:run', id),

    onStep: (cb: (step: unknown) => void) => {
      const handler = (_: unknown, step: unknown) => cb(step);

      ipcRenderer.on('workspace:step', handler);

      return () => ipcRenderer.removeListener('workspace:step', handler);
    },
  },

  webview: {
    open: (id: string, url: string) => ipcRenderer.invoke('webview:open', { id, url }),
  },

  agent: {
    status: () => ipcRenderer.invoke('agent:status'),
    refresh: () => ipcRenderer.invoke('agent:refresh'),
    start: () => ipcRenderer.invoke('agent:start'),
    stop: () => ipcRenderer.invoke('agent:stop'),
    restart: () => ipcRenderer.invoke('agent:restart'),
    ensure: () => ipcRenderer.invoke('agent:ensure'),
    openLog: () => ipcRenderer.invoke('agent:openLog'),
    onStatus: (cb: (snap: unknown) => void) => {
      const handler = (_: unknown, snap: unknown) => cb(snap);
      ipcRenderer.on('agent:status', handler);
      return () => ipcRenderer.removeListener('agent:status', handler);
    },
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),

    getAbout: () => ipcRenderer.invoke('app:getAbout'),
  },
};

contextBridge.exposeInMainWorld('zhuboDesktop', api);

export type ZhuboDesktopApi = typeof api;
