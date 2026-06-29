const SENSITIVE_PATTERNS: Array<{ regex: RegExp; replace: (m: RegExpMatchArray) => string }> = [
  {
    regex: /(Cookie\s*=\s*)([^\s;,\r\n]+)/gi,
    replace: (m) => `${m[1]}[已脱敏]`,
  },
  {
    regex: /(Authorization\s*:\s*Bearer\s+)([^\s\r\n]+)/gi,
    replace: (m) => `${m[1]}[已脱敏]`,
  },
  {
    regex: /(token\s*=\s*)([^\s&;,\r\n]+)/gi,
    replace: (m) => `${m[1]}[已脱敏]`,
  },
  {
    regex: /(password\s*=\s*)([^\s&;,\r\n]+)/gi,
    replace: (m) => `${m[1]}[已脱敏]`,
  },
  {
    regex: /(AGENT_TOKEN\s*=\s*)([^\s\r\n]+)/gi,
    replace: (m) => `${m[1]}[已脱敏]`,
  },
  {
    regex: /(CONTROL_SERVICE_TOKEN\s*=\s*)([^\s\r\n]+)/gi,
    replace: (m) => `${m[1]}[已脱敏]`,
  },
];

export function sanitizeLogLine(line: string): string {
  let out = line;
  for (const { regex, replace } of SENSITIVE_PATTERNS) {
    out = out.replace(regex, (...args) => replace(args as unknown as RegExpMatchArray));
  }
  return out;
}

export function sanitizeLogChunk(chunk: string): string {
  return chunk
    .split(/\r?\n/)
    .map((line) => sanitizeLogLine(line))
    .join('\n');
}
