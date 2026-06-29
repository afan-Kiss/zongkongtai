#!/usr/bin/env node
/**
 * 新系统接入总控：自动生成 zhubo-control.manifest.json
 *
 * 用法：
 *   npm run control:init-project -- --path "E:\我的软件源码\新项目"
 *   npm run control:init-project -- --path "..." --name "项目名" --code "my-code" --category "工具服务"
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MANIFEST = 'zhubo-control.manifest.json';
const FORBIDDEN = /xiangyuzhubao\.xyz|wss:\/\//i;

function parseArgs(argv) {
  const out = { path: '', name: '', code: '', category: '', gitRemote: '', interactive: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path' && argv[i + 1]) out.path = argv[++i];
    else if (a === '--name' && argv[i + 1]) out.name = argv[++i];
    else if (a === '--code' && argv[i + 1]) out.code = argv[++i];
    else if (a === '--category' && argv[i + 1]) out.category = argv[++i];
    else if (a === '--git' && argv[i + 1]) out.gitRemote = argv[++i];
    else if (a === '--yes' || a === '-y') out.interactive = false;
  }
  if (out.path) out.interactive = false;
  return out;
}

function ask(rl, q, def = '') {
  return new Promise((resolve) => {
    const hint = def ? ` [${def}]` : '';
    rl.question(`${q}${hint}: `, (ans) => resolve((ans || def).trim()));
  });
}

function slugCode(name) {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
}

function readGitRemote(dir) {
  try {
    const cfg = fs.readFileSync(path.join(dir, '.git', 'config'), 'utf8');
    const m = cfg.match(/url\s*=\s*(.+)/);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

function detectPackageManager(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml')))
    return 'python';
  return 'unknown';
}

function detectStartCommand(dir, pm) {
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scripts = pkg.scripts || {};
      if (scripts.dev) return `${pm === 'npm' ? 'npm run dev' : `${pm} dev`}`;
      if (scripts.start) return `${pm === 'npm' ? 'npm start' : `${pm} start`}`;
    } catch {
      /* ignore */
    }
  }
  if (pm === 'python') return 'python main.py';
  return '';
}

function extractPortsFromText(text) {
  const ports = new Set();
  const patterns = [
    /listen\s*\(\s*(\d{4,5})/gi,
    /PORT\s*[=:]\s*(\d{4,5})/gi,
    /port\s*[=:]\s*(\d{4,5})/gi,
    /127\.0\.0\.1:(\d{4,5})/g,
    /localhost:(\d{4,5})/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const p = Number(m[1]);
      if (p >= 1024 && p <= 65535) ports.add(p);
    }
  }
  return [...ports].sort((a, b) => a - b);
}

function detectPorts(dir) {
  const ports = new Set();
  const files = ['vite.config.ts', 'vite.config.js', 'server.js', 'app.js', 'index.js', '.env.example'];
  for (const f of files) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) {
      try {
        for (const p of extractPortsFromText(fs.readFileSync(fp, 'utf8'))) ports.add(p);
      } catch {
        /* ignore */
      }
    }
  }
  // monorepo apps/*
  const appsDir = path.join(dir, 'apps');
  if (fs.existsSync(appsDir)) {
    for (const ent of fs.readdirSync(appsDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      for (const f of ['package.json', 'src/index.ts', 'src/index.js']) {
        const fp = path.join(appsDir, ent.name, f);
        if (fs.existsSync(fp)) {
          try {
            for (const p of extractPortsFromText(fs.readFileSync(fp, 'utf8'))) ports.add(p);
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  return [...ports].sort((a, b) => a - b);
}

function detectFrameworkHints(dir) {
  const hints = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      const n = ent.name.toLowerCase();
      if (n.includes('express') || n === 'server.js' || n === 'app.js') hints.push('express');
      if (n.includes('fastify')) hints.push('fastify');
      if (n.endsWith('.py')) hints.push('python');
    }
    if (depth < 2) {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        if (ent.isDirectory() && !['node_modules', '.git', 'dist'].includes(ent.name)) {
          walk(path.join(d, ent.name), depth + 1);
        }
      }
    }
  };
  walk(dir, 0);
  const pkg = path.join(dir, 'package.json');
  if (fs.existsSync(pkg)) {
    const deps = JSON.stringify(JSON.parse(fs.readFileSync(pkg, 'utf8')));
    if (/express/.test(deps)) hints.push('express');
    if (/fastify/.test(deps)) hints.push('fastify');
  }
  return [...new Set(hints)];
}

function buildManifest(opts) {
  const pm = detectPackageManager(opts.dir);
  const ports = detectPorts(opts.dir);
  const start = detectStartCommand(opts.dir, pm);
  const mainPort = ports[0];
  const hasWeb = ports.includes(5173) || ports.includes(3000) || ports.includes(4726);
  const webPort = ports.includes(5173) ? 5173 : ports.includes(3000) ? 3000 : mainPort;
  const healthType = pm === 'python' && !ports.length ? 'process' : mainPort ? 'http' : 'process';

  const manifest = {
    manifestVersion: 1,
    name: opts.name,
    code: opts.code,
    category: opts.category || '其他',
    locationType: 'local',
    gitRemote: opts.gitRemote || readGitRemote(opts.dir) || '',
    localPath: opts.dir.replace(/\//g, '\\'),
    desktopStartCommand: start,
    desktopStopMode: 'process-tree',
    localWebUrl: hasWeb || mainPort ? `http://127.0.0.1:${webPort}` : '',
    localHealthUrl: mainPort ? `http://127.0.0.1:${mainPort}/api/health` : '',
    publicUrl: '',
    internalUrl: mainPort ? `http://127.0.0.1:${mainPort}` : '',
    healthType,
    ports,
    services: start
      ? [{ name: 'main', command: start, port: mainPort || undefined }]
      : [],
    control: {
      enabled: true,
      showInDesktop: true,
      autoStart: false,
      cookieMode: 'none',
      notes: opts.developing ? '开发中，先登记 manifest，待功能完成后再验收启动' : '由 control:init-project 生成，请人工核对端口与启动命令',
    },
  };

  if (FORBIDDEN.test(JSON.stringify(manifest))) {
    throw new Error('manifest 含禁止域名，请改用 127.0.0.1 或 8.137.126.18');
  }
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let dir = args.path;
  if (!dir && args.interactive) {
    dir = await ask(rl, '项目本地路径');
  }
  if (!dir) {
    console.error('请指定 --path "E:\\我的软件源码\\新项目"');
    process.exit(1);
  }
  dir = path.resolve(dir);
  if (!fs.existsSync(dir)) {
    console.error('路径不存在:', dir);
    process.exit(1);
  }

  const existing = path.join(dir, MANIFEST);
  if (fs.existsSync(existing)) {
    console.error('已存在', MANIFEST, '— 如需覆盖请先备份');
    process.exit(1);
  }

  let name = args.name;
  let code = args.code;
  let category = args.category;
  let gitRemote = args.gitRemote;

  if (args.interactive) {
    name = await ask(rl, '项目名称', path.basename(dir));
    code = await ask(rl, '项目 code（英文唯一标识）', slugCode(name));
    category = await ask(rl, '分类', '其他');
    gitRemote = await ask(rl, 'Git 地址（可留空）', readGitRemote(dir));
  } else {
    name = name || path.basename(dir);
    code = code || slugCode(name);
    category = category || '其他';
  }
  rl.close();

  const developing = /开发|wip|draft/i.test(name) || /dev|wip/i.test(code);
  const manifest = buildManifest({ dir, name, code, category, gitRemote, developing });
  fs.writeFileSync(existing, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log('\n已生成:', existing);
  console.log(JSON.stringify(manifest, null, 2));

  const hints = detectFrameworkHints(dir);
  if (hints.includes('express')) {
    console.log('\n提示: 检测到 Express，可参考 docs/templates/new-system/health-node-express.example.js 添加 /api/health');
  }
  if (hints.includes('fastify')) {
    console.log('\n提示: 检测到 Fastify，可参考 docs/templates/new-system/health-node-express.example.ts');
  }
  if (hints.includes('python')) {
    console.log('\n提示: 检测到 Python，可参考 docs/templates/new-system/health-python-flask.example.py 或 health-python-fastapi.example.py');
  }
  console.log('\n下一步:');
  console.log('  1. 核对 manifest 中的端口与启动命令');
  console.log('  2. 提交 manifest 到 Git（不要提交 .env / Cookie）');
  console.log('  3. 在 EXE 点「从 manifest 导入」或触发 Agent 扫描');
  console.log('  4. 阅读 docs/NEW_SYSTEM_ONBOARDING.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
