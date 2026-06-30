/** 顶部栏 / 总览 — 本地状态文案 */

export function cookieBarState(
  updatedAt: string | null,
  foundCount = 0,
): { ok: boolean; text: string; warn: boolean } {
  if (foundCount >= 4 && updatedAt) {
    const ageMs = Date.now() - Date.parse(updatedAt);
    if (ageMs > 6 * 3600000) return { ok: false, text: '超时', warn: true };
    if (ageMs > 2 * 3600000) return { ok: false, text: '即将过期', warn: true };
    return { ok: true, text: '正常', warn: false };
  }
  if (foundCount > 0) return { ok: false, text: '部分收到', warn: true };
  return { ok: false, text: '未收到', warn: true };
}

export function cookieReadFailToast(): string {
  return '暂时无法读取本地 Cookie 状态，请稍后重试。';
}

export function qianfanStaleMessage(updatedAt: string | null) {
  if (!updatedAt) return '暂未收到千帆 Cookie，请启动千帆中转机器人后点立即同步。';
  const age = Date.now() - Date.parse(updatedAt);
  if (age > 6 * 3600000) return 'Cookie 超过 6 小时没更新，建议立即同步。';
  if (age > 2 * 3600000) return 'Cookie 即将过期，建议点立即同步。';
  return 'Cookie 状态正常。';
}
