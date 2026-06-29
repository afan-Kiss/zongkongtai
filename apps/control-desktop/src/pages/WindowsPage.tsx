import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

export function WindowsPage() {
  const [windows, setWindows] = useState<any[]>([]);
  const [helper, setHelper] = useState<{ exists: boolean; path: string } | null>(null);
  const pushToast = useAppStore((s) => s.pushToast);

  const refresh = async () => {
    const status = await window.zhuboDesktop.native.status();
    setHelper(status);
    if (status.exists) {
      const list = await window.zhuboDesktop.native.listWindows();
      setWindows(list.slice(0, 50));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const arrange = async () => {
    try {
      const res = await window.zhuboDesktop.native.arrangeQianfan();
      pushToast('success', res.messages?.join(' ') || '排列完成');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">窗口管理</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={refresh}>刷新列表</Button>
          <Button onClick={arrange}>千帆左 + 总控右 排列</Button>
        </div>
      </div>
      {helper && !helper.exists && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          窗口助手未构建：请运行 npm run build:native
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="text-sm text-muted-foreground">可见窗口（前 50 个）</div>
        </CardHeader>
        <CardContent className="max-h-[520px] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2">标题</th>
                <th className="p-2">进程</th>
                <th className="p-2">PID</th>
                <th className="p-2">尺寸</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.hwnd} className="border-t border-border/40">
                  <td className="max-w-xs truncate p-2">{w.title}</td>
                  <td className="p-2">{w.processName}</td>
                  <td className="p-2">{w.pid}</td>
                  <td className="p-2">{w.width}x{w.height}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
