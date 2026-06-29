import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const agentConfig = {
  name: process.env.AGENT_NAME || 'Windows本地Agent',
  token: process.env.AGENT_TOKEN || 'change-me-agent-token',
  serviceToken: process.env.SERVICE_TOKEN || process.env.CONTROL_SERVICE_TOKEN || '',
  scanRoot: process.env.SCAN_ROOT || 'E:\\我的软件源码',
  serverUrl: process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control',
  version: '0.1.0',
};

export function getWsUrl(): string {
  const base = agentConfig.serverUrl.replace(/^http/, 'ws');
  return `${base}/api/agent/ws?token=${encodeURIComponent(agentConfig.token)}`;
}
