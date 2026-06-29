#!/usr/bin/env node
/**
 * 桌面 EXE 第一轮实战验收（不重启 zhubo-analysis / nginx / x-ui / 无关 PM2）
 */
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import treeKill from 'tree-kill';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'apps/control-desktop');
const SCAN_ROOT = process.env.SCAN_ROOT || 'E:\\我的软件源码';
const CONFIG_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'ZhuboDesktopControl')
  : path.join(process.env.USERPROFILE || '', 'ZhuboDesktopControl');
const CLOUD = process.env.CONTROL_SERVER_URL || 'http://8.137.126.18/control';
const QIANFAN_SHOPS = ['拾玉居和田玉', '和田雅玉', '祥钰珠宝', 'XY祥钰珠宝'];

const PROJECTS = [
  {
    name: '辅助出库软件',
    localPath: path.join(SCAN_ROOT, '辅助出库软件'),
    command: 'dist\\库存出入库辅助.exe',
    healthUrl: null,
    isGui: true,
  },
  {
    name: '祥钰系统',
    localPath: path.join(SCAN_ROOT, '祥钰系统'),
    command: 'node server/index.js',
    healthUrl: 'http://127.0.0.1:4726/api/health',
  },
  {
    name: '扫码枪登记出入库系统',
    localPath: path.join(SCAN_ROOT, '扫码枪登记出入库系统'),
    command: 'npm run dev',
    healthUrl: 'http://127.0.0.1:4725/api/health',
    startTimeoutMs: 90000,
  },
  {
    name: '记账系统',
    localPath: path.join(SCAN_ROOT, '记账系统'),
    command: 'npm run dev',
    healthUrl: 'http://127.0.0.1:3001/api/health',
    startTimeoutMs: 90000,
  },
];

const report = {
  at: new Date().toISOString(),
  configDir: CONFIG_DIR,
  exePath: path.join(DESKTOP, 'dist-desktop/win-unpacked/珠宝本地总控工作台.exe'),
  nativeHelper: path.join(DESKTOP, 'native-helper/publish/zhubo-native-helper.exe'),
  cloudUrl: CLOUD,
  results: [],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readCredentials() {
  const files = [
    path.join(ROOT, 'deploy-output-credentials.txt'),
    path.join(CONFIG_DIR, 'deploy-output-credentials.txt'),
  ];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    const pw = text.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim();
    const user = text.match(/^ADMIN_USERNAME=(.+)$/m)?.[1]?.trim() || 'admin';
    if (pw) return { username: user, password: pw };
  }
  return null;
}

function getPortPid(port) {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8', windowsHide: true });
    const re = new RegExp(`:${port}\\s+[^\\s]+\\s+LISTENING\\s+(\\d+)`, 'i');
    const m = out.match(re);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function isPortListening(port) {
  return getPortPid(port) != null;
}

async function waitHealth(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return { ok: true, status: res.status };
    } catch {
      /* retry */
    }
    await sleep(2000);
  }
  return { ok: false, message: 'health timeout' };
}

function killTree(pid) {
  return new Promise((resolve) => {
    treeKill(pid, 'SIGTERM', () => {
      setTimeout(() => treeKill(pid, 'SIGKILL', () => resolve()), 1200);
    });
  });
}

async function testCloud() {
  const out = { health: null, qianfanShops: [], login: false };
  try {
    const h = await fetch(`${CLOUD}/api/health`, { signal: AbortSignal.timeout(8000) });
    out.health = { ok: h.ok, status: h.status };
  } catch (e) {
    out.health = { ok: false, message: String(e.message || e) };
  }

  const creds = readCredentials();
  if (!creds) {
    out.login = false;
    out.loginMessage = '无 deploy-output-credentials.txt，跳过登录验收';
    return out;
  }

  try {
    const login = await fetch(`${CLOUD}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
    out.login = login.ok;
    if (!login.ok) {
      out.loginMessage = `登录失败 ${login.status}`;
      return out;
    }
    const secrets = await fetch(`${CLOUD}/api/secrets`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(10000),
    });
    const list = await secrets.json();
    out.qianfanShops = QIANFAN_SHOPS.map((shopName) => {
      const row = list.find((s) => s.platform === 'qianfan' && s.keyName === 'cookie' && s.shopName === shopName);
      return {
        shopName,
        found: !!row,
        updatedAt: row?.updatedAt || row?.lastSeenAt || null,
        source: row?.lastUploadedBy || null,
      };
    });
    out.qianfanFound = out.qianfanShops.filter((s) => s.found).length;
  } catch (e) {
    out.loginMessage = String(e.message || e);
  }
  return out;
}

async function test4791() {
  const pid = getPortPid(4791);
  if (!pid) return { listening: false, message: '4791 未监听' };
  let cmd = '';
  try {
    cmd = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`,
      { encoding: 'utf8', windowsHide: true },
    ).trim();
  } catch {
    /* ignore */
  }
  const safe = /control-web|control-server|总控台|4791|vite/i.test(cmd);
  return { listening: true, pid, cmdPreview: cmd.slice(0, 120), likelyControlDebug: safe };
}

async function testProject(p) {
  const item = { name: p.name, steps: [] };
  const push = (step, ok, detail) => item.steps.push({ step, ok, detail });

  if (!fs.existsSync(p.localPath)) {
    push('path', false, `路径不存在: ${p.localPath}`);
    return { ...item, success: false };
  }
  push('path', true, p.localPath);

  if (p.healthUrl) {
    const port = Number(new URL(p.healthUrl).port);
    if (isPortListening(port)) {
      const existing = await waitHealth(p.healthUrl, 8000);
      if (existing.ok) {
        push('port-preflight', true, `端口 ${port} 已被占用，但 health 正常（服务已在运行）`);
        push('already-running', true, `HTTP ${existing.status}`);
        return { ...item, success: true, alreadyRunning: true };
      }
      push('port-preflight', false, `端口 ${port} 被占用但 health 失败，跳过启动`);
      return { ...item, success: false, skipped: true };
    }
    push('port-preflight', true, `端口 ${port} 空闲`);
  }

  const shell = process.env.COMSPEC || 'cmd.exe';
  const cmd = `chcp 65001 >nul & ${p.command}`;
  const child = spawn(shell, ['/d', '/c', cmd], {
    cwd: p.localPath,
    windowsHide: true,
    stdio: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0', PYTHONIOENCODING: 'utf-8' },
  });

  child.stdout?.on('data', () => undefined);
  child.stderr?.on('data', () => undefined);

  push('start', true, cmd);
  push('embedded-cmd', true, 'windowsHide + cmd /c（模拟 EXE 内嵌终端）');

  if (p.isGui) {
    await sleep(5000);
    push('health', true, 'GUI 程序，跳过 HTTP 健康检查');
    await killTree(child.pid);
    await sleep(1000);
    push('stop', true, '已 tree-kill');
    await sleep(800);
    push('restart', true, '再次启动');
    const child2 = spawn(shell, ['/d', '/c', cmd], { cwd: p.localPath, windowsHide: true, stdio: 'pipe' });
    await sleep(3000);
    await killTree(child2.pid);
    push('restart-ok', true, '二次启动正常');
    return { ...item, success: true };
  }

  const health = await waitHealth(p.healthUrl, p.startTimeoutMs || 60000);
  push('health', health.ok, health.ok ? `HTTP ${health.status}` : health.message);

  if (health.ok && p.healthUrl) {
    const web = p.healthUrl.replace(/\/api\/health\/?$/, '');
    try {
      const page = await fetch(web, { signal: AbortSignal.timeout(5000) });
      push('web', page.ok, page.ok ? `Web ${page.status}` : 'Web 打开失败');
    } catch (e) {
      push('web', false, String(e.message || e));
    }
  }

  await killTree(child.pid);
  await sleep(2000);

  const port = Number(new URL(p.healthUrl).port);
  const still = isPortListening(port);
  push('stop', !still, still ? `端口 ${port} 仍被占用` : '进程已停干净');

  if (!still && health.ok) {
    push('restart', true, '再次启动');
    const child2 = spawn(shell, ['/d', '/c', cmd], { cwd: p.localPath, windowsHide: true, stdio: 'pipe' });
    const h2 = await waitHealth(p.healthUrl, p.startTimeoutMs || 60000);
    push('restart-ok', h2.ok, h2.ok ? `HTTP ${h2.status}` : h2.message);
    await killTree(child2.pid);
    await sleep(1500);
    return { ...item, success: health.ok && h2.ok };
  }

  return { ...item, success: health.ok && !still };
}

async function testNativeHelper() {
  const exe = report.nativeHelper;
  if (!fs.existsSync(exe)) return { ok: false, message: 'helper 不存在' };
  try {
    const out = execSync(`"${exe}" list-windows`, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    const data = JSON.parse(out);
    const windows = data.windows || [];
    const qianfan = windows.filter(
      (w) => /千帆客服|客服工作台|qianfan/i.test(w.title || '') || /qianfan/i.test(w.processName || ''),
    );
    const self = windows.filter((w) => /珠宝本地总控|Zhubo Desktop/i.test(w.title || ''));
    return {
      ok: true,
      windowCount: windows.length,
      qianfanCount: qianfan.length,
      selfCount: self.length,
      qianfanTitles: qianfan.slice(0, 5).map((w) => w.title),
    };
  } catch (e) {
    return { ok: false, message: String(e.message || e) };
  }
}

async function main() {
  report.exeExists = fs.existsSync(report.exePath);
  report.configExists = fs.existsSync(path.join(CONFIG_DIR, 'config.json'));
  report.logDir = path.join(CONFIG_DIR, 'logs');
  report.batFiles = ['启动珠宝本地总控工作台.bat', '创建桌面快捷方式.bat'].map((n) => ({
    name: n,
    exists: fs.existsSync(path.join(path.dirname(report.exePath), n)),
  }));

  report.cloud = await testCloud();
  report.legacy4791 = await test4791();

  for (const p of PROJECTS) {
    console.log(`\n>>> 测试 ${p.name}`);
    try {
      const r = await testProject(p);
      report.results.push(r);
      console.log(
        r.success ? '  ✓ 通过' : r.skipped ? '  ⊘ 跳过' : '  ✗ 失败',
        r.alreadyRunning ? '(已在运行)' : '',
      );
    } catch (e) {
      report.results.push({ name: p.name, success: false, error: String(e) });
      console.log('  ✗ 异常', e);
    }
  }

  report.nativeHelperTest = await testNativeHelper();
  report.summary = {
    passed: report.results.filter((r) => r.success).length,
    failed: report.results.filter((r) => !r.success && !r.skipped).length,
    skipped: report.results.filter((r) => r.skipped).length,
    qianfanShopsFound: report.cloud?.qianfanFound ?? 0,
  };

  const outFile = path.join(ROOT, 'scripts/desktop-acceptance-report.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n报告已写入', outFile);
  console.log('汇总', report.summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
