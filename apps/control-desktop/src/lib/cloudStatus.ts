/** 顶部 / 总览用的云端、Cookie、Agent 展示文案 — 不暴露原始错误 */

export function cloudBarText(connected: boolean): string {
  return connected ? '已连接' : '未连接';
}

export function cookieBarState(
  cloudConnected: boolean,
  updatedAt: string | null,
): { ok: boolean; text: string; warn: boolean } {
  if (!cloudConnected) {
    return { ok: true, text: '需连接云端查看', warn: false };
  }
  if (!updatedAt) {
    return { ok: false, text: '暂未收到', warn: true };
  }
  const ageMs = Date.now() - Date.parse(updatedAt);
  if (ageMs > 3 * 3600000) {
    return { ok: false, text: '超时', warn: true };
  }
  return { ok: true, text: '正常', warn: false };
}

export function agentBarText(agentStatus: { state?: string; message?: string } | null): {
  ok: boolean;
  text: string;
  warn: boolean;
} {
  if (!agentStatus) return { ok: true, text: '检查中…', warn: false };
  switch (agentStatus.state) {
    case 'online':
      return { ok: true, text: '在线', warn: false };
    case 'starting':
      return { ok: false, text: '启动中', warn: true };
    default:
      if (/token|连接|云端|认证|401|403|password/i.test(agentStatus.message || '')) {
        return { ok: false, text: '需重新连接云端', warn: true };
      }
      if (/未配置|找不到|源码/i.test(agentStatus.message || '')) {
        return { ok: false, text: '未启动', warn: true };
      }
      return { ok: false, text: '离线', warn: true };
  }
}

export function cloudHintMessage(): string {
  return '云端功能需要登录，项目/Git/终端等本地功能不受影响。';
}

export function cloudFailToastMessage(): string {
  return '云端连接失败，不影响本地功能。';
}

export function cookieReadFailToast(): string {
  return '暂时无法读取云端 Cookie，请先确认云端连接。';
}

export function agentCloudAuthToast(): string {
  return 'Agent 暂时无法同步云端，本地功能仍可使用。';
}

export function isAuthLikeError(raw: string): boolean {
  return /401|403|invalid.*password|unauthorized|用户名|密码|credential/i.test(raw);
}
