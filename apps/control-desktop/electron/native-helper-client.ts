import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { fileLog } from './file-logger';

export interface WindowInfo {
  hwnd: number;
  title: string;
  processName: string;
  pid: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

function helperPath(): string {
  const packaged = path.join(process.resourcesPath, 'native-helper', 'zhubo-native-helper.exe');
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  const dev = path.resolve(__dirname, '../native-helper/publish/zhubo-native-helper.exe');
  if (fs.existsSync(dev)) return dev;
  const devAlt = path.resolve(__dirname, '../../native-helper/publish/zhubo-native-helper.exe');
  return devAlt;
}

function runHelper(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const exe = helperPath();
    if (!fs.existsSync(exe)) {
      reject(new Error(`找不到窗口助手：${exe}，请先运行 npm run build:native`));
      return;
    }
    const child = spawn(exe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      if (code !== 0) {
        const err = stderr.trim() || stdout.trim() || `helper exit ${code}`;
        fileLog.native(`helper failed: ${args.join(' ')} → ${err}`, 'error');
        reject(new Error(err));
        return;
      }
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch {
        resolve({ raw: stdout.trim() });
      }
    });
  });
}

export async function listWindows(): Promise<WindowInfo[]> {
  const res = await runHelper(['list-windows']);
  return res.windows || [];
}

export async function findWindowsByProcess(processName: string): Promise<WindowInfo[]> {
  const res = await runHelper(['find-by-process', processName]);
  return res.windows || [];
}

export async function moveWindow(opts: {
  hwnd?: number;
  pid?: number;
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const args = [
    'move-window',
    '--x',
    String(opts.x),
    '--y',
    String(opts.y),
    '--width',
    String(opts.width),
    '--height',
    String(opts.height),
  ];
  if (opts.hwnd) args.push('--hwnd', String(opts.hwnd));
  if (opts.pid) args.push('--pid', String(opts.pid));
  if (opts.title) args.push('--title', opts.title);
  return runHelper(args);
}

export async function focusWindow(hwnd: number) {
  return runHelper(['focus-window', '--hwnd', String(hwnd)]);
}

export async function setAlwaysOnTop(hwnd: number, onTop: boolean) {
  return runHelper(['set-top', '--hwnd', String(hwnd), '--value', onTop ? '1' : '0']);
}

export async function arrangeQianfanWorkspace(mainHwnd?: number) {
  const { screen } = await import('electron');
  const display = screen.getPrimaryDisplay();
  const { x: areaX, y: areaY, width, height } = display.workArea;
  const leftW = Math.floor(width * 0.6);
  const rightW = width - leftW;

  const qianfanNames = ['千帆客服工作台', '千帆客服', '客服工作台', 'qianfan'];
  const windows = await listWindows();
  let qianfanWin = windows.find((w) =>
    qianfanNames.some(
      (n) => w.title.includes(n) || w.processName.toLowerCase().includes('qianfan'),
    ),
  );
  if (!qianfanWin) {
    const byProc = await findWindowsByProcess('千帆客服工作台.exe');
    qianfanWin = byProc[0];
  }

  const results: string[] = [];
  if (qianfanWin) {
    await moveWindow({ hwnd: qianfanWin.hwnd, x: areaX, y: areaY, width: leftW, height });
    results.push(`千帆客服台已排列到左侧 (${leftW}x${height})`);
  } else {
    results.push('没找到千帆客服台窗口，请先打开客服台。');
  }

  if (mainHwnd) {
    await moveWindow({ hwnd: mainHwnd, x: areaX + leftW, y: areaY, width: rightW, height });
    results.push(`总控工作台已排列到右侧 (${rightW}x${height})`);
  }

  return { ok: !!qianfanWin, messages: results, qianfanFound: !!qianfanWin };
}

export function getHelperStatus() {
  const exe = helperPath();
  return { path: exe, exists: fs.existsSync(exe) };
}
