import { PRIORITY_PORTS } from './constants';

const PORT_ENV_KEYS = ['PORT', 'VITE_PORT', 'SERVER_PORT', 'API_PORT', 'SCANNER_API_PORT'];

const PORT_PATTERNS: Array<{ regex: RegExp; protocol?: string }> = [
  { regex: /(?:^|\s)([A-Z][A-Z0-9_]*PORT)\s*=\s*(\d{2,5})/gim },

  { regex: /(?:^|\s)(PORT|VITE_PORT|SERVER_PORT|API_PORT|SCANNER_API_PORT)\s*=\s*(\d{2,5})/gim },

  { regex: /(?:^|\s)port\s*:\s*(\d{2,5})/gim },

  { regex: /"port"\s*:\s*(\d{2,5})/gim },

  { regex: /devtoolsPort\s*:\s*(\d{2,5})/gim },

  { regex: /(?:BRIDGE_PORT|DEVTOOLS_PORT)\s*\|\|\s*(\d{2,5})/gim },

  { regex: /localhost:(\d{2,5})/gi, protocol: 'http' },

  { regex: /127\.0\.0\.1:(\d{2,5})/gi, protocol: 'http' },

  { regex: /0\.0\.0\.0:(\d{2,5})/gi, protocol: 'http' },

  { regex: /\.listen\s*\(\s*(\d{2,5})/g },

  { regex: /app\.listen\s*\(\s*(\d{2,5})/g },

  { regex: /server\.listen\s*\(\s*(\d{2,5})/g },

  { regex: /listen\s*\(\s*['"]?(\d{2,5})/g },

  { regex: /--port\s+(\d{2,5})/g },

  { regex: /-p\s+(\d{2,5})/g },

  { regex: /ws:\/\/localhost:(\d{2,5})/gi, protocol: 'ws' },

  { regex: /http:\/\/localhost:(\d{2,5})/gi, protocol: 'http' },

  { regex: /http:\/\/127\.0\.0\.1:(\d{2,5})/gi, protocol: 'http' },

  { regex: /"(\d{2,5}):(\d{2,5})"/g },

  { regex: /ports:\s*\n\s*-\s*['"]?(\d{2,5}):/gim },
];

export interface DetectedPort {
  port: number;

  protocol: string;

  host: string;

  sourceLine: number;

  context: string;
}

function isLikelyPort(n: number): boolean {
  if (n < 1 || n > 65535) return false;

  if (n >= 1900 && n <= 2100) return false;

  if (n >= 2020 && n <= 2030) return false;

  return n >= 1000 || PRIORITY_PORTS.has(n);
}

function detectionKey(port: number, line: number, context: string): string {
  return `${port}|${line}|${context.slice(0, 60)}`;
}

export function extractPortsFromText(content: string, filePath: string): DetectedPort[] {
  const lines = content.split(/\r?\n/);

  const found: DetectedPort[] = [];

  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { regex, protocol } of PORT_PATTERNS) {
      regex.lastIndex = 0;

      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        const raw = match[match.length - 1] ?? match[1];

        const port = Number(raw);

        if (!Number.isFinite(port) || !isLikelyPort(port)) continue;

        const context = line.trim().slice(0, 120);

        const key = detectionKey(port, i + 1, context);

        if (seen.has(key)) continue;

        seen.add(key);

        found.push({
          port,

          protocol: protocol ?? guessProtocol(line, filePath),

          host: guessHost(line),

          sourceLine: i + 1,

          context,
        });
      }
    }

    for (const key of PORT_ENV_KEYS) {
      const m = line.match(new RegExp(`${key}\\s*=\\s*(\\d{2,5})`, 'i'));

      if (m) {
        const port = Number(m[1]);

        const context = line.trim().slice(0, 120);

        const dedupe = detectionKey(port, i + 1, context);

        if (isLikelyPort(port) && !seen.has(dedupe)) {
          seen.add(dedupe);

          found.push({
            port,

            protocol: 'http',

            host: '127.0.0.1',

            sourceLine: i + 1,

            context,
          });
        }
      }
    }
  }

  return found;
}

function guessProtocol(line: string, filePath: string): string {
  if (/ws:\/\//i.test(line)) return 'ws';

  if (/https:\/\//i.test(line)) return 'https';

  if (/docker-compose|nginx/i.test(filePath)) return 'tcp';

  return 'http';
}

function guessHost(line: string): string {
  if (/0\.0\.0\.0/.test(line)) return '0.0.0.0';

  if (/127\.0\.0\.1/.test(line)) return '127.0.0.1';

  if (/localhost/i.test(line)) return 'localhost';

  return '127.0.0.1';
}

export function maskSecret(value: string): string {
  if (value.length <= 18) return '*'.repeat(Math.min(value.length, 8));

  return `${value.slice(0, 10)}${'*'.repeat(Math.min(20, value.length - 18))}${value.slice(-8)}`;
}
