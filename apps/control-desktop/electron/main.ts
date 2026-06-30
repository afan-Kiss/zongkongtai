import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { initConfig } from './config';
import { initFileLogger, fileLog } from './file-logger';
import { applyAutoLaunchFromConfig } from './auto-launch';
import { processManager } from './process-manager';
import { readProjectManifest } from './manifest-scanner';
import { startLocalControlApi } from './local-control-api';
import { DEFAULT_RISK_BY_CODE } from '../../../packages/control-shared/src/steward';

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException', err);
  fileLog.app(`uncaughtException: ${err.message}`, 'error');
});
process.on('unhandledRejection', (err) => {
  console.error('[main] unhandledRejection', err);
  fileLog.app(`unhandledRejection: ${String(err)}`, 'error');
});

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function buildStopAllProjects() {
  return processManager.getRunning().map((p) => {
    const m = p.cwd ? readProjectManifest(p.cwd) : null;
    return {
      id: p.projectId,
      name: p.projectName,
      code: m?.code,
      riskLevel: m?.riskLevel || (m?.code ? DEFAULT_RISK_BY_CODE[m.code] : undefined),
    };
  });
}

async function confirmStopRunningProjects(): Promise<boolean> {
  const running = processManager.getRunning();
  if (running.length === 0) return true;

  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const { response } = await dialog.showMessageBox(win || undefined, {
    type: 'warning',
    buttons: ['停止并退出', '取消'],
    defaultId: 1,
    cancelId: 1,
    title: '还有项目在运行',
    message: `当前有 ${running.length} 个项目仍在运行`,
    detail: running.map((p) => `· ${p.projectName}`).join('\n'),
  });

  if (response !== 0) return false;
  await processManager.stopAll({ projects: buildStopAllProjects(), userConfirmed: true });
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0a0f',
    title: '珠宝本地总控工作台',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  registerIpcHandlers(() => mainWindow);
  void startLocalControlApi();

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] crashed', details);
    fileLog.app(`renderer crashed: ${details.reason}`, 'error');
  });

  mainWindow.on('close', async (e) => {
    if (isQuitting) return;
    const running = processManager.getRunning();
    if (running.length === 0) return;
    e.preventDefault();
    const ok = await confirmStopRunningProjects();
    if (ok) {
      isQuitting = true;
      mainWindow?.destroy();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initConfig();
  initFileLogger();
  applyAutoLaunchFromConfig();
  fileLog.app(`启动 v${app.getVersion()} path=${process.execPath}`);
  createWindow();
});

app.on('before-quit', async (e) => {
  if (isQuitting) return;
  const running = processManager.getRunning();
  if (running.length === 0) return;
  e.preventDefault();
  const ok = await confirmStopRunningProjects();
  if (ok) {
    isQuitting = true;
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.setAppUserModelId('com.zhubo.desktop-control');
