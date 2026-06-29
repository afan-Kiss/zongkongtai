export const SCAN_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'logs',
  'tmp',
  'cache',
  '.turbo',
  'vendor',
  '__pycache__',
  '.venv',
  'release',
  'out',
]);

export const SCAN_FILE_NAMES = new Set([
  'package.json',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'server.js',
  'app.js',
  'main.js',
  'index.js',
  'ecosystem.config.js',
  'docker-compose.yml',
  'Dockerfile',
  'nginx.conf',
  'README.md',
]);

export const SCAN_FILE_PATTERNS = [
  /^vite\.config\./,
  /^next\.config\./,
  /^nuxt\.config\./,
  /\.bat$/,
  /\.cmd$/,
  /\.ps1$/,
  /\.(ts|tsx|js|jsx|py)$/,
];

export const PRIORITY_PORTS = new Set([
  80, 443, 3000, 3001, 4723, 4725, 4730, 4790, 4788, 5173, 7788, 7789, 11434,
]);

export const PACKAGE_SCRIPT_KEYS = [
  'dev',
  'start',
  'build',
  'serve',
  'preview',
  'worker',
  'deploy',
  'acceptance',
  'test',
] as const;
