const LISTENER_SOURCE_TYPES = new Set(['env', 'package-json', 'code', 'vite', 'pm2', 'docker', 'cmd', 'bat', 'ps1']);

const PROTECTED_PORTS = new Set([80, 443, 11434]);



const NAMED_PORT_ASSIGN = /(?:^|\s)[A-Z][A-Z0-9_]*PORT\s*=\s*\d/i;

const CONFIG_PORT = /(?:"port"|port|devtoolsPort|mobileHttps)\s*[:=]\s*\d/i;

const LISTENER_PATTERNS =

  /(?:^|\s)(?:PORT|VITE_PORT|SERVER_PORT|API_PORT|SCANNER_API_PORT)\s*=|(?:^|\s)[A-Z][A-Z0-9_]*PORT\s*=|(?:^|\s)(?:"port"|port|devtoolsPort)\s*:|\.listen\s*\(|app\.listen\s*\(|server\.listen\s*\(|listen\s*\(|--port\s+|-p\s+\d|ports:\s*$/i;



const CLIENT_URL_ENV =

  /(?:^|\s)(?:API_URL|API_BASE_URL|BASE_URL|SCANNER_API_URL|CONTROL_SERVER_URL|SERVER_URL|HEALTH_URL|EXCEL_BRIDGE_URL|PRINT_AGENT_URL)\s*=/i;

const CLIENT_FETCH = /fetch\s*\(|axios\.(?:get|post|put|delete|request)\s*\(/i;

const LOG_OR_PRINT_URL = /(?:console\.(?:log|info|warn)|log\s*\()[^)]*https?:\/\//i;



export type PortRole = 'listener' | 'client_reference' | 'proxy' | 'unknown';



export function inferPortRole(input: {

  sourceType: string;

  purpose?: string | null;

  sourceFile?: string | null;

  port: number;

}): PortRole {

  const purpose = input.purpose || '';

  const sourceType = input.sourceType || 'unknown';



  if (sourceType === 'nginx') return 'proxy';

  if (sourceType === 'runtime') return 'listener';

  if (/netsh|advfirewall|firewall add rule/i.test(purpose)) {
    return 'unknown';
  }

  if (PROTECTED_PORTS.has(input.port) && !LISTENER_PATTERNS.test(purpose)) {

    return 'client_reference';

  }



  if (LISTENER_PATTERNS.test(purpose) || NAMED_PORT_ASSIGN.test(purpose) || CONFIG_PORT.test(purpose)) {

    if (LOG_OR_PRINT_URL.test(purpose) && !NAMED_PORT_ASSIGN.test(purpose) && !CONFIG_PORT.test(purpose)) {

      // 纯日志里的 URL 不算监听

    } else {

      return 'listener';

    }

  }



  if (sourceType === 'docker' || sourceType === 'pm2') {

    return 'listener';

  }



  if (CLIENT_URL_ENV.test(purpose) || CLIENT_FETCH.test(purpose)) {

    return 'client_reference';

  }



  if (LOG_OR_PRINT_URL.test(purpose)) {

    return 'client_reference';

  }



  if (/https?:\/\/|ws:\/\//i.test(purpose)) {

    return 'client_reference';

  }



  return 'unknown';

}



export function normalizeHost(host: string | null | undefined): string {

  const h = (host || '127.0.0.1').toLowerCase();

  if (h === 'localhost' || h === '0.0.0.0') return '127.0.0.1';

  return h;

}



export function isListenerRole(role: string): boolean {

  return role === 'listener';

}



export function isListenerSourceType(sourceType: string): boolean {

  return LISTENER_SOURCE_TYPES.has(sourceType);

}


