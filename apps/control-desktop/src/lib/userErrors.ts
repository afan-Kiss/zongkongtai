/** 把 IPC / Git / Native 技术错误转成用户能看懂的大白话 */

export function humanizeUserError(
  raw: string,
  context?: 'git' | 'native' | 'login' | 'cloud' | 'cookie' | 'agent',
): string {
  const msg = raw.trim();
  if (!msg) return '操作失败，请重试';

  if (context === 'cookie') {
    return '暂时无法读取本地 Cookie，请确认千帆中转机器人已运行并同步。';
  }

  if (/Error invoking remote method 'native:arrangeQianfan'/i.test(msg)) {
    return '窗口排列组件异常，不影响其他功能。你可以手动排列窗口。';
  }
  if (/MoveWindowNative|user32\.dll/i.test(msg)) {
    return '窗口排列组件不可用，已跳过。你可以手动排列窗口。';
  }
  if (/pathspec.*did not match any files/i.test(msg)) {
    return '有文件已不存在，已跳过。请刷新 Git 状态后再试。';
  }
  if (context === 'git' && /^fatal:/i.test(msg)) {
    return 'Git 上传失败，请刷新 Git 状态后再试。';
  }
  if (/Error invoking remote method/i.test(msg)) {
    return '操作失败，请稍后重试。';
  }
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}
