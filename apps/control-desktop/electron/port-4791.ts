import { execSync } from 'child_process';
import treeKill from 'tree-kill';
import { isPortListening } from './port-manager';
import { fileLog } from './file-logger';

const LEGACY_PORT = 4791;
const CONTROL_SERVER_PORT = 4790;

const SAFE_CMD_PATTERNS = [
  /[\\/]apps[\\/]control-web/i,
  /[\\/]apps[\\/]control-server/i,
  /@zhubo[\\/]control-web/i,
  /@zhubo[\\/]control-server/i,
  /zhubo-control-center/i,
  /总控台[\\/]/,
  /总控台.*vite/i,
  /control-web.*vite/i,
  /control-server.*tsx/i,
  /control-server.*dist/i,
];

const UNSAFE_CMD_PATTERNS = [
  /[\\/]记账系统/i,
  /[\\/]扫码枪/i,
  /[\\/]祥钰/i,
  /[\\/]zhubo-analysis/i,
  /[\\/]千帆/i,
  /jade-account/i,
  /@jade\//i,
  /@live\//i,
];

function getProcessCommandLine(pid: number): string {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`,
      { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    return out.trim();
  } catch {
    return '';
  }
}

function classify4791Process(pid: number, processName?: string) {
  const cmd = getProcessCommandLine(pid);
  const name = (processName || '').toLowerCase();

  if (name !== 'node.exe' && name !== 'node') {
    return {
      canClose: false,
      cmd,
      reason: `端口 ${LEGACY_PORT} 由 ${processName || '未知进程'} 占用，不是 node 调试进程，不能自动关闭`,
    };
  }

  if (UNSAFE_CMD_PATTERNS.some((p) => p.test(cmd))) {
    return {
      canClose: false,
      cmd,
      reason: '命令行看起来属于其他业务项目，为安全起见不会自动关闭',
    };
  }

  if (SAFE_CMD_PATTERNS.some((p) => p.test(cmd))) {
    return { canClose: true, cmd, reason: '识别为本地总控台联调进程' };
  }

  const p4790 = isPortListening(CONTROL_SERVER_PORT);
  if (p4790?.pid && /dist[\\/]index\.js/i.test(cmd)) {
    const cmd4790 = getProcessCommandLine(p4790.pid);
    if (/dist[\\/]index\.js/i.test(cmd4790)) {
      return {
        canClose: true,
        cmd,
        reason: `识别为本地总控台遗留调试（${CONTROL_SERVER_PORT}+${LEGACY_PORT} 均为 dist/index.js）`,
      };
    }
  }

  if (/vite|4791|control-web/i.test(cmd)) {
    return {
      canClose: true,
      cmd,
      reason: '识别为本地总控前端 vite 联调进程',
    };
  }

  if (/dist[\\/]index\.js/i.test(cmd)) {
    return {
      canClose: false,
      cmd,
      reason: '命令行为 dist/index.js，但无法确认是否为总控台本地联调，请手动检查后关闭',
    };
  }

  return {
    canClose: false,
    cmd,
    reason: '无法确认进程归属，只提示不自动关闭',
  };
}

export function inspectLegacy4791() {
  const rt = isPortListening(LEGACY_PORT);
  if (!rt?.pid) {
    return {
      port: LEGACY_PORT,
      listening: false,
      label: '本地联调遗留端口，可关闭。',
      canClose: false,
      message: `端口 ${LEGACY_PORT} 当前未监听`,
    };
  }

  const cls = classify4791Process(rt.pid, rt.processName);
  return {
    port: LEGACY_PORT,
    listening: true,
    pid: rt.pid,
    processName: rt.processName,
    label: '本地联调遗留端口，可关闭。',
    canClose: cls.canClose,
    message: cls.reason,
    commandPreview: cls.cmd ? cls.cmd.slice(0, 200) : '',
    commandFull: cls.cmd || '',
  };
}

export async function closeLegacy4791(): Promise<{ ok: boolean; message: string }> {
  const info = inspectLegacy4791();
  if (!info.listening) {
    return { ok: true, message: `端口 ${LEGACY_PORT} 未在监听，无需关闭` };
  }
  if (!info.canClose || !info.pid) {
    fileLog.process(`拒绝关闭 4791: ${info.message}`, 'warn');
    return { ok: false, message: info.message };
  }

  await new Promise<void>((resolve) => {
    treeKill(info.pid!, 'SIGTERM', () => {
      setTimeout(() => treeKill(info.pid!, 'SIGKILL', () => resolve()), 1500);
    });
  });

  await new Promise((r) => setTimeout(r, 800));
  const still = isPortListening(LEGACY_PORT);
  if (still) {
    fileLog.process(`关闭 4791 失败 PID=${info.pid}`, 'error');
    return { ok: false, message: `已尝试关闭 PID ${info.pid}，但端口 ${LEGACY_PORT} 仍在监听` };
  }

  fileLog.process(`已关闭本地 4791 调试进程 PID=${info.pid}`);
  return { ok: true, message: `已关闭本地总控台调试进程 (PID ${info.pid})` };
}
