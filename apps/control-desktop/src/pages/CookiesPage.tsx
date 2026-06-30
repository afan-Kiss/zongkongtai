import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, RefreshCw, BookOpen, Upload } from 'lucide-react';
import {
  QIANFAN_CANONICAL_SHOPS,
  qianfanCookieFreshness,
  qianfanCookieStatusLabel,
} from '@zhubo/control-shared';
import { Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { formatRelativeTime, hashPrefix } from '@/lib/utils';
import { qianfanStaleMessage } from '@/lib/localStatus';
import { humanizeUserError } from '@/lib/userErrors';
import { useAppStore } from '@/stores/appStore';

type ShopRow = {
  shopName: string;
  found?: boolean;
  updatedAt?: string | null;
  cookieHash?: string | null;
  cookieLength?: number | null;
  source?: string;
};

function freshnessBadgeVariant(freshness: string) {
  if (freshness === 'normal') return 'success';
  if (freshness === 'expiring' || freshness === 'stale') return 'warning';
  return 'muted';
}

function CookieSyncGuide({ onOpenRelay }: { onOpenRelay: () => void }) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <div className="flex items-center gap-2 font-medium">
          <BookOpen className="h-4 w-4" /> Cookie 是怎么同步的？
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p className="font-mono text-xs text-foreground/80">
          千帆客服台 → 千帆中转机器人 → 本地 Cookie 中心 → 需要 Cookie 的本地项目
        </p>
        <p>保持千帆客服台登录，必要时点一下「立即同步 Cookie」。</p>
        <Button size="sm" variant="secondary" onClick={onOpenRelay}>
          打开千帆中转机器人
        </Button>
      </CardContent>
    </Card>
  );
}

export function CookiesPage() {
  const setPage = useAppStore((s) => s.setPage);
  const projects = useAppStore((s) => s.projects);
  const pushToast = useAppStore((s) => s.pushToast);
  const setQianfanCookie = useAppStore((s) => s.setQianfanCookie);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);
  const [lastAutoSync, setLastAutoSync] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pasteShop, setPasteShop] = useState<string>(QIANFAN_CANONICAL_SHOPS[0]);
  const [pasteText, setPasteText] = useState('');
  const [pasteUploading, setPasteUploading] = useState(false);

  const openRelayProject = () => {
    const relay = projects.find((p) => p.code === 'qianfan-relay' || p.name.includes('千帆中转'));
    if (relay?.localPath) {
      window.zhuboDesktop.shell.openPath(relay.localPath);
    } else {
      pushToast('info', '未找到千帆中转机器人项目，请到「项目」页确认 manifest 已扫描。');
      setPage('projects');
    }
  };

  const checkRelay = useCallback(async () => {
    const r = await window.zhuboDesktop.cookie.testRelay();
    setRelayOnline(r.ok);
    if (r.ok) {
      const st = await window.zhuboDesktop.cookie.relayStatus();
      setLastAutoSync(st?.lastAutoSyncAt || null);
    }
    return r.ok;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await checkRelay();
      const data = await window.zhuboDesktop.cookie.localShops();
      setShops(data.shops || []);
      const summary = await window.zhuboDesktop.cookie.localSummary();
      setQianfanCookie(summary.latestUpdatedAt, summary.hash8 || null);
    } catch {
      pushToast('info', '暂时无法读取本地 Cookie 状态');
    } finally {
      setLoading(false);
    }
  }, [pushToast, checkRelay, setQianfanCookie]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncNow = async (autoRetry = false) => {
    setSyncing(true);
    try {
      let online = relayOnline;
      if (!online) online = await checkRelay();
      if (!online && !autoRetry) {
        const started = await window.zhuboDesktop.cookie.startRelay();
        pushToast('info', started.message);
        await new Promise((r) => setTimeout(r, 4000));
        online = await checkRelay();
      }
      if (!online) {
        pushToast('info', '千帆中转机器人未运行，请先启动。');
        return;
      }

      const res = await window.zhuboDesktop.cookie.syncNow();
      await refresh();

      const total = res.total ?? 4;
      const success = res.success ?? 0;
      if (res.ok && success >= total) {
        pushToast('success', `Cookie 已同步：${success}/${total} 店成功`);
      } else if (success > 0) {
        pushToast(
          'info',
          `Cookie 部分同步成功：${success}/${total} 店成功，请确认千帆客服台是否打开`,
        );
      } else {
        pushToast('info', res.message || '同步失败，请先打开千帆客服台');
      }
    } catch (e) {
      pushToast('info', humanizeUserError(e instanceof Error ? e.message : String(e), 'native'));
    } finally {
      setSyncing(false);
    }
  };

  const pasteUpload = async () => {
    setPasteUploading(true);
    try {
      const res = await window.zhuboDesktop.cookie.pasteUpload({
        shopName: pasteShop,
        cookie: pasteText,
      });
      if (res.ok) {
        pushToast('success', `已保存 ${pasteShop} · hash ${res.hash8} · 长度 ${res.length}`);
        setPasteText('');
        await refresh();
      } else {
        pushToast('info', res.message);
      }
    } finally {
      setPasteUploading(false);
    }
  };

  const shopCards =
    shops.length > 0
      ? shops
      : QIANFAN_CANONICAL_SHOPS.map((name) => ({ shopName: name, found: false }));

  const foundCount = shopCards.filter((s) => s.found).length;
  const autoSyncLabel = lastAutoSync ? `${formatRelativeTime(lastAutoSync)}前` : '—';

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cookie 状态</h1>
          <p className="text-sm text-muted-foreground">
            正式四店 · 已同步 {foundCount}/4 店 · 本地 Cookie 中心
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            自动同步：{relayOnline ? '已开启' : '需启动千帆中转机器人'}
            {relayOnline ? ` · 上次自动同步：${autoSyncLabel}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => syncNow(false)} disabled={syncing || loading}>
            {syncing ? '正在同步 Cookie...' : '立即同步 Cookie'}
          </Button>
          <Button size="sm" variant="secondary" onClick={refresh} disabled={loading || syncing}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> 刷新状态
          </Button>
        </div>
      </div>

      {relayOnline === false && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span className="text-amber-100">千帆中转机器人未运行，无法自动采集 Cookie。</span>
            <Button
              size="sm"
              onClick={async () => {
                const r = await window.zhuboDesktop.cookie.startRelay();
                pushToast('info', r.message);
                await new Promise((res) => setTimeout(res, 4000));
                const ok = await checkRelay();
                if (ok) void syncNow(true);
              }}
            >
              启动千帆中转机器人
            </Button>
          </CardContent>
        </Card>
      )}

      {showGuide && <CookieSyncGuide onOpenRelay={openRelayProject} />}

      <div className="grid gap-3 lg:grid-cols-2">
        {shopCards.map((s) => {
          const freshness = qianfanCookieFreshness(s.updatedAt, !!s.found, true);
          const label = qianfanCookieStatusLabel(freshness);
          return (
            <div key={s.shopName} className="glass rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{s.shopName}</div>
                <Badge variant={freshnessBadgeVariant(freshness)}>{label}</Badge>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <div>最后更新：{s.updatedAt ? formatRelativeTime(s.updatedAt) : '—'}</div>
                <div>来源：{s.source || '千帆中转机器人'}</div>
                {s.cookieHash && <div>hash8：{hashPrefix(s.cookieHash)}</div>}
                {s.cookieLength != null && s.cookieLength > 0 && <div>长度：{s.cookieLength}</div>}
                {s.found && (
                  <div className="text-foreground/80">
                    {qianfanStaleMessage(s.updatedAt || null)}
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
                  刷新
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => syncNow(false)}
                  disabled={syncing}
                >
                  立即同步
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Card className="border-border/60">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          高级：手动粘贴 Cookie
          <ChevronDown className={`h-4 w-4 transition ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>
        {showAdvanced && (
          <CardContent className="space-y-3 border-t border-border/60 pt-4 text-sm">
            <p className="text-xs text-amber-200">
              一般不需要手动粘贴。优先使用「立即同步 Cookie」。
            </p>
            <label className="block">
              <span className="text-muted-foreground">店铺</span>
              <select
                className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                value={pasteShop}
                onChange={(e) => setPasteShop(e.target.value)}
              >
                {QIANFAN_CANONICAL_SHOPS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-muted-foreground">Cookie 文本</span>
              <textarea
                className="mt-1 min-h-[100px] w-full rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="仅在自动同步不可用时粘贴"
              />
            </label>
            <Button size="sm" onClick={pasteUpload} disabled={pasteUploading || !pasteText.trim()}>
              <Upload className="h-3 w-3" /> 保存到本地
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
