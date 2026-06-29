import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getConfigDir, loadConfig, saveConfig } from './config';

const AUTO_START_FILE = path.join(getConfigDir(), 'auto-start.json');

export function isAutoLaunchEnabled(): boolean {
  try {
    if (fs.existsSync(AUTO_START_FILE)) {
      return JSON.parse(fs.readFileSync(AUTO_START_FILE, 'utf8')).enabled === true;
    }
  } catch {
    /* ignore */
  }
  return app.getLoginItemSettings().openAtLogin;
}

export function setAutoLaunch(enabled: boolean) {
  fs.mkdirSync(getConfigDir(), { recursive: true });
  fs.writeFileSync(AUTO_START_FILE, JSON.stringify({ enabled }), 'utf8');
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: [],
  });
}

export function applyAutoLaunchFromConfig() {
  if (isAutoLaunchEnabled()) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }
}
