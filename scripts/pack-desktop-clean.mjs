#!/usr/bin/env node
/**
 * 稳定桌面打包：检测旧 EXE 占用 → 清理临时目录 → 输出到 dist-desktop-pack-current
 */
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DESKTOP = path.join(ROOT, 'apps/control-desktop');
const EXE_NAME = '珠宝本地总控工作台.exe';
const OUT_DIR = path.join(DESKTOP, 'dist-desktop-pack-current');
const TEMP_DIR = path.join(DESKTOP, 'dist-desktop-pack-temp');

function isOurExeRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq 珠宝本地总控工作台.exe" /NH', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return /珠宝本地总控工作台\.exe/i.test(out) && !/No tasks/i.test(out);
  } catch {
    return false;
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return true;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    console.log(`已清理：${path.relative(ROOT, dir)}`);
    return true;
  } catch (e) {
    console.warn(`无法删除 ${path.relative(ROOT, dir)}：${e.message}`);
    return false;
  }
}

function moveAsideLocked(dir) {
  if (!fs.existsSync(dir)) return true;
  const backup = `${dir}-locked-${Date.now()}`;
  try {
    fs.renameSync(dir, backup);
    console.log(`旧目录已移走：${path.relative(ROOT, backup)}`);
    return true;
  } catch (e) {
    console.warn(`无法移走 ${path.relative(ROOT, dir)}：${e.message}`);
    return false;
  }
}

if (isOurExeRunning()) {
  console.error('');
  console.error('检测到「珠宝本地总控工作台.exe」正在运行。');
  console.error('请先关闭该窗口后再执行 npm run pack:desktop:clean');
  console.error('（本命令不会结束其他业务项目的进程）');
  console.error('');
  process.exit(1);
}

rmDir(TEMP_DIR);

let outputName = 'dist-desktop-pack-current';
const plannedOut = path.join(DESKTOP, outputName);
if (fs.existsSync(plannedOut) && !rmDir(plannedOut) && !moveAsideLocked(plannedOut)) {
  outputName = `dist-desktop-pack-${Date.now()}`;
  console.warn(`当前 dist-desktop-pack-current 被占用，改打包到 ${outputName}`);
}
const finalOutDir = path.join(DESKTOP, outputName);
const finalExe = path.join(finalOutDir, 'win-unpacked', EXE_NAME);

console.log('正在 build + pack …');
const build = spawnSync('npm', ['run', 'build', '-w', '@zhubo/control-desktop'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const pack = spawnSync(
  'npx',
  [
    'electron-builder',
    '--win',
    'dir',
    '--config.directories.output=' + outputName,
  ],
  { cwd: DESKTOP, stdio: 'inherit', shell: true },
);
if (pack.status !== 0) process.exit(pack.status ?? 1);

console.log('');
console.log('打包完成。推荐 EXE 路径：');
console.log(finalExe);
if (fs.existsSync(finalExe)) {
  console.log('（文件已生成）');
} else {
  console.warn('（未找到 EXE，请检查 electron-builder 输出）');
}
