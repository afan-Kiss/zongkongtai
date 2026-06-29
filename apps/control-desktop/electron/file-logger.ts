import fs from 'fs';
import path from 'path';
import { sanitizeLogLine } from './sanitize';
import { getConfigDir } from './config';

export type LogCategory = 'app' | 'process' | 'terminal' | 'native-helper' | 'cloud';

const LOG_DIR = path.join(getConfigDir(), 'logs');
const RETAIN_DAYS = 7;

function mainLogFile(category: LogCategory) {
  return path.join(LOG_DIR, `${category}.log`);
}

function datedLogFile(category: LogCategory) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(LOG_DIR, `${category}-${stamp}.log`);
}

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function pruneOldLogs() {
  try {
    ensureLogDir();
    const cutoff = Date.now() - RETAIN_DAYS * 86400000;
    for (const name of fs.readdirSync(LOG_DIR)) {
      if (!name.endsWith('.log')) continue;
      const full = path.join(LOG_DIR, name);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch {
    /* ignore */
  }
}

export function getLogDir() {
  return LOG_DIR;
}

export function initFileLogger() {
  ensureLogDir();
  pruneOldLogs();
  writeLog('app', 'info', '文件日志已初始化');
}

export function writeLog(category: LogCategory, level: string, message: string) {
  try {
    ensureLogDir();
    const line = `[${new Date().toISOString()}] [${level}] ${sanitizeLogLine(message)}\n`;
    fs.appendFileSync(mainLogFile(category), line, 'utf8');
    fs.appendFileSync(datedLogFile(category), line, 'utf8');
  } catch {
    /* ignore disk errors */
  }
}

export const fileLog = {
  app: (msg: string, level = 'info') => writeLog('app', level, msg),
  process: (msg: string, level = 'info') => writeLog('process', level, msg),
  terminal: (msg: string, level = 'info') => writeLog('terminal', level, msg),
  native: (msg: string, level = 'info') => writeLog('native-helper', level, msg),
  cloud: (msg: string, level = 'info') => writeLog('cloud', level, msg),
};
