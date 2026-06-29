import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Card';

import { Button } from '@/components/ui/Button';

import { useAppStore } from '@/stores/appStore';

const PRIORITY = [
  4723, 4725, 4726, 4727, 4730, 4790, 4791, 6780, 7788, 7789, 7890, 9322, 9323, 11434, 3001, 5173,
  80, 443,
];

export function PortsPage() {
  const [cloud, setCloud] = useState<any[]>([]);

  const [local, setLocal] = useState<any[]>([]);

  const [legacy4791, setLegacy4791] = useState<any>(null);

  const [closing, setClosing] = useState(false);

  const pushToast = useAppStore((s) => s.pushToast);

  const load = async () => {
    const [portsRes, legacy] = await Promise.all([
      window.zhuboDesktop.cloud.ports(),

      window.zhuboDesktop.ports.inspect4791(),
    ]);

    setCloud(portsRes.cloud || []);

    setLocal(portsRes.local || []);

    setLegacy4791(legacy);
  };

  useEffect(() => {
    load().catch(() => pushToast('error', '加载端口信息失败'));
  }, [pushToast]);

  const close4791 = async () => {
    if (!legacy4791?.canClose) {
      pushToast('info', legacy4791?.message || '无法确认进程归属，请手动关闭');

      return;
    }

    const ok = window.confirm(
      `即将关闭本地 4791 调试进程 (PID ${legacy4791.pid})。\n\n${legacy4791.message}\n\n确认继续？`,
    );

    if (!ok) return;

    setClosing(true);

    try {
      const res = await window.zhuboDesktop.ports.close4791();

      pushToast(res.ok ? 'success' : 'error', res.message);

      await load();
    } finally {
      setClosing(false);
    }
  };

  const localMap = new Map(local.map((p) => [p.port, p]));

  const rows = cloud

    .filter(
      (p) =>
        PRIORITY.includes(p.port) ||
        p.conflictLevel === 'conflict' ||
        p.conflictLevel === 'warning',
    )

    .slice(0, 80);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">端口</h1>

      {legacy4791 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium text-amber-100">端口 4791 — {legacy4791.label}</div>

              <div className="mt-1 text-xs text-muted-foreground">
                {legacy4791.listening
                  ? `正在监听 · ${legacy4791.processName || '?'} (PID ${legacy4791.pid}) · ${legacy4791.message}`
                  : legacy4791.message}
              </div>

              {legacy4791.commandPreview && (
                <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {legacy4791.commandPreview}
                </div>
              )}
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={close4791}
              disabled={closing || !legacy4791.listening}
            >
              {closing ? '关闭中…' : '关闭本地 4791 调试进程'}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">端口</th>

              <th className="p-3">状态</th>

              <th className="p-3">项目</th>

              <th className="p-3">进程</th>

              <th className="p-3">说明</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((p) => {
              const rt = localMap.get(p.port);

              const level = p.conflictLevel || 'none';

              const variant =
                level === 'conflict' ? 'destructive' : level === 'warning' ? 'warning' : 'success';

              const label = level === 'conflict' ? '冲突' : level === 'warning' ? '注意' : '正常';

              const note =
                p.port === 4791
                  ? `${p.conflictReason || p.purpose || ''} · 本地联调遗留端口，可关闭。`.trim()
                  : p.conflictReason || p.purpose?.slice(0, 60);

              return (
                <tr key={p.id} className="border-t border-border/50">
                  <td className="p-3 font-mono">{p.port}</td>

                  <td className="p-3">
                    <Badge variant={variant}>{label}</Badge>
                  </td>

                  <td className="p-3">{p.project?.name || '未登记'}</td>

                  <td className="p-3 text-xs">
                    {rt ? `${rt.processName || '?'} (${rt.pid})` : '—'}
                  </td>

                  <td className="p-3 text-xs text-muted-foreground">{note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
