import { useCallback, useEffect, useState } from 'react';

import { ExternalLink, RefreshCw, LayoutGrid } from 'lucide-react';

import { Badge } from '@/components/ui/Card';

import { Button } from '@/components/ui/Button';

import { formatRelativeTime, hashPrefix } from '@/lib/utils';

import { qianfanStaleMessage } from '@/hooks/useCloudBootstrap';

import { humanizeUserError } from '@/lib/userErrors';

export function CookiesPage() {
  const [shops, setShops] = useState<any[]>([]);

  const [archived, setArchived] = useState<any[]>([]);

  const [showTest, setShowTest] = useState(false);

  const [loading, setLoading] = useState(false);

  const pushToast = useAppStore((s) => s.pushToast);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const data = await window.zhuboDesktop.cloud.qianfanShops(showTest);

      setShops(data.shops || data);

      setArchived(data.archived || []);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));

      setShops([]);

      setArchived([]);
    } finally {
      setLoading(false);
    }
  }, [pushToast, showTest]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const arrange = async () => {
    try {
      const res = await window.zhuboDesktop.native.arrangeQianfan();
      if (res.qianfanFound) {
        pushToast('success', res.messages.join('；'));
      } else {
        pushToast('info', res.messages.join('；') || '窗口排列组件不可用，已跳过。');
      }
    } catch (e) {
      pushToast('info', humanizeUserError(e instanceof Error ? e.message : String(e), 'native'));
    }
  };

  const foundCount = shops.filter((s) => s.found).length;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cookie 状态</h1>

          <p className="text-sm text-muted-foreground">
            正式四店 Cookie 同步状态 · 已同步 {foundCount}/4 店（仅显示 canonical 名称）
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showTest}
              onChange={(e) => setShowTest(e.target.checked)}
            />
            显示测试/历史 Cookie
          </label>

          <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.zhuboDesktop.cloud.openSecretsPage()}
          >
            <ExternalLink className="h-3 w-3" /> 云端 Cookie 管理
          </Button>

          <Button size="sm" onClick={arrange}>
            <LayoutGrid className="h-3 w-3" /> 排列千帆 + 总控
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {shops.map((s) => {
          const stale = s.stale;

          const variant = !s.found ? 'muted' : stale ? 'warning' : 'success';

          const label = !s.found ? '无数据' : stale ? '需关注' : '正常';

          return (
            <div key={s.shopName} className="glass rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{s.shopName}</div>

                <Badge variant={variant}>{label}</Badge>
              </div>

              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                {s.rawShopName && s.rawShopName !== s.shopName && (
                  <div>原始识别名：{s.rawShopName}</div>
                )}

                <div>最后更新：{s.updatedAt ? formatRelativeTime(s.updatedAt) : '—'}</div>

                <div>来源：{s.found ? s.source : '千帆中转机器人（等待上传）'}</div>

                {s.cookieHash && <div>Hash：{hashPrefix(s.cookieHash)}</div>}

                <div className={stale && s.found ? 'text-amber-300' : 'text-foreground'}>
                  {qianfanStaleMessage(s.updatedAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showTest && archived.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">测试 / 历史 Cookie</h2>

          <div className="grid gap-2">
            {archived.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground"
              >
                <div className="font-medium text-foreground">{s.shopName || s.rawShopName}</div>

                <div>
                  Hash：{hashPrefix(s.cookieHash)} · 更新：
                  {s.updatedAt ? formatRelativeTime(s.updatedAt) : '—'}
                </div>

                <div>来源：{s.lastUploadedBy || s.collectorSource || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shops.length === 0 && !loading && (
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          总控台还没有 Cookie 数据。请确认公司电脑千帆中转机器人在线，或点击上方打开云端 Cookie
          管理页。
        </div>
      )}
    </div>
  );
}
