import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export interface DesktopConfig {
  scanRoot: string;
  configVersion?: number;
  autoStart?: boolean;
}

const CONFIG_VERSION = 3;

export function getConfigDir() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'ZhuboDesktopControl');
  }
  return path.join(os.homedir(), 'ZhuboDesktopControl');
}

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS: DesktopConfig = {
  scanRoot: 'E:\\我的软件源码',
  configVersion: CONFIG_VERSION,
  autoStart: false,
};

function restrictConfigFilePermissions(file: string) {
  try {
    if (process.platform === 'win32') {
      const user = process.env.USERDOMAIN
        ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
        : process.env.USERNAME;
      if (user) {
        execSync(`icacls "${file}" /inheritance:r /grant:r "${user}:(R,W)"`, { stdio: 'ignore' });
      }
    } else {
      fs.chmodSync(file, 0o600);
    }
  } catch {
    /* best effort */
  }
}

function pickLocalFields(raw: Record<string, unknown>): DesktopConfig {
  return {
    scanRoot: String(raw.scanRoot || DEFAULTS.scanRoot),
    configVersion: CONFIG_VERSION,
    autoStart: raw.autoStart === true,
  };
}

export function initConfig(): DesktopConfig {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (fs.existsSync(CONFIG_FILE)) {
    return loadConfig();
  }
  saveConfig(DEFAULTS);
  return { ...DEFAULTS };
}

export function loadConfig(): DesktopConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
    return pickLocalFields(raw);
  } catch {
    const backup = `${CONFIG_FILE}.bak.${Date.now()}`;
    try {
      fs.copyFileSync(CONFIG_FILE, backup);
    } catch {
      /* ignore */
    }
    return { ...DEFAULTS };
  }
}

export function saveConfig(partial: Partial<DesktopConfig>): DesktopConfig {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const current = loadConfig();
  const next: DesktopConfig = {
    scanRoot: partial.scanRoot?.trim() ? partial.scanRoot.trim() : current.scanRoot,
    configVersion: CONFIG_VERSION,
    autoStart: partial.autoStart !== undefined ? !!partial.autoStart : current.autoStart,
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  restrictConfigFilePermissions(CONFIG_FILE);
  return next;
}

export function getConfigFilePath() {
  return CONFIG_FILE;
}

export function isConfigComplete(cfg: DesktopConfig) {
  return !!cfg.scanRoot?.trim();
}
