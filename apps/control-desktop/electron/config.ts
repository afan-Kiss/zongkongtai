import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DesktopConfig {
  controlServerUrl: string;
  adminUsername: string;
  adminPassword: string;
  agentToken: string;
  serviceToken: string;
  scanRoot: string;
  importedFromCredentials?: boolean;
  configVersion?: number;
}

const CONFIG_VERSION = 1;

export function getConfigDir() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'ZhuboDesktopControl');
  }
  return path.join(os.homedir(), 'ZhuboDesktopControl');
}

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS: DesktopConfig = {
  controlServerUrl: 'http://8.137.126.18/control',
  adminUsername: 'admin',
  adminPassword: '',
  agentToken: '',
  serviceToken: '',
  scanRoot: 'E:\\我的软件源码',
  configVersion: CONFIG_VERSION,
};

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function credentialCandidates() {
  return [
    path.resolve(process.cwd(), 'deploy-output-credentials.txt'),
    path.resolve(process.cwd(), '../../deploy-output-credentials.txt'),
    path.resolve(__dirname, '../../../deploy-output-credentials.txt'),
    path.join(getConfigDir(), 'deploy-output-credentials.txt'),
  ];
}

function readCredentialsFile(): Partial<DesktopConfig> & { found?: boolean } {
  for (const file of credentialCandidates()) {
    if (!fs.existsSync(file)) continue;
    try {
      const text = fs.readFileSync(file, 'utf8');
      const admin = text.match(/^ADMIN_PASSWORD=(.+)$/m);
      const agent = text.match(/^AGENT_TOKEN=(.+)$/m);
      const service = text.match(/^SERVICE_TOKEN=(.+)$/m);
      const url = text.match(/^CONTROL_SERVER_URL=(.+)$/m);
      return {
        found: true,
        adminPassword: admin?.[1]?.trim(),
        agentToken: agent?.[1]?.trim(),
        serviceToken: service?.[1]?.trim(),
        controlServerUrl: url?.[1]?.trim(),
      };
    } catch {
      /* ignore */
    }
  }
  return { found: false };
}

function readEnvLocal(): Partial<DesktopConfig> {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../.env.local'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const env = parseEnvFile(fs.readFileSync(file, 'utf8'));
    return {
      controlServerUrl: env.CONTROL_SERVER_URL,
      adminUsername: env.ADMIN_USERNAME,
      adminPassword: env.ADMIN_PASSWORD,
      agentToken: env.AGENT_TOKEN,
      serviceToken: env.CONTROL_SERVICE_TOKEN || env.SERVICE_TOKEN,
      scanRoot: env.SCAN_ROOT,
    };
  }
  return {};
}

function mergeFilled(base: DesktopConfig, patch: Partial<DesktopConfig>): DesktopConfig {
  const next = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') continue;
    (next as Record<string, unknown>)[k] = v;
  }
  return next;
}

/** 首次运行：从 deploy-output-credentials.txt 导入并写入用户目录 */
export function initConfig(): DesktopConfig {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  if (fs.existsSync(CONFIG_FILE)) {
    return loadConfig();
  }

  const fromCreds = readCredentialsFile();
  const fromEnv = readEnvLocal();
  const initial = mergeFilled(DEFAULTS, {
    ...fromEnv,
    ...(fromCreds.found
      ? {
          adminPassword: fromCreds.adminPassword,
          agentToken: fromCreds.agentToken,
          serviceToken: fromCreds.serviceToken,
          controlServerUrl: fromCreds.controlServerUrl,
          importedFromCredentials: true,
        }
      : {}),
  });

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2), 'utf8');
  return initial;
}

export function loadConfig(): DesktopConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS, ...readEnvLocal() };
  }

  let user: Partial<DesktopConfig> = {};
  try {
    user = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    const backup = `${CONFIG_FILE}.bak.${Date.now()}`;
    try {
      fs.copyFileSync(CONFIG_FILE, backup);
    } catch {
      /* ignore */
    }
    user = {};
  }

  return { ...DEFAULTS, ...user };
}

export function saveConfig(partial: Partial<DesktopConfig>): DesktopConfig {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const current = loadConfig();
  const next = { ...current, ...partial, configVersion: CONFIG_VERSION };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function getConfigFilePath() {
  return CONFIG_FILE;
}

export function hasCredentialsSource() {
  return readCredentialsFile().found === true;
}

export function maskToken(value?: string) {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function isConfigComplete(cfg: DesktopConfig) {
  return !!(cfg.controlServerUrl && cfg.adminUsername && cfg.adminPassword);
}
