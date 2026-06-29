const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    const key = s.slice(0, i).trim();
    let val = s.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const fileEnv = loadEnvFile(path.join(__dirname, '.env'));

const prodDbPath = path.join(__dirname, 'apps/control-server/prod.db');

module.exports = {
  apps: [
    {
      name: 'zhubo-control-center',
      cwd: path.join(__dirname, 'apps/control-server'),
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: fileEnv.PORT || 4790,
        HOST: fileEnv.HOST || '127.0.0.1',
        SESSION_SECRET: fileEnv.SESSION_SECRET,
        SECRET_ENCRYPTION_KEY: fileEnv.SECRET_ENCRYPTION_KEY,
        SERVICE_TOKEN: fileEnv.SERVICE_TOKEN,
        ADMIN_USERNAME: fileEnv.ADMIN_USERNAME,
        ADMIN_PASSWORD: fileEnv.ADMIN_PASSWORD,
        // Prisma SQLite 路径相对 schema.prisma 所在目录；生产用绝对路径避免误连 prisma/prod.db
        DATABASE_URL: fileEnv.DATABASE_URL || `file:${prodDbPath}`,
      },
      max_memory_restart: '512M',
      error_file: '/www/wwwroot/zhubo-control-center/logs/pm2-error.log',
      out_file: '/www/wwwroot/zhubo-control-center/logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
