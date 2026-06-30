import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, LayoutGrid, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { formatRelativeTime, hashPrefix } from '@/lib/utils';
import { qianfanStaleMessage } from '@/hooks/useCloudBootstrap';
import { humanizeUserError } from '@/lib/userErrors';
import { cookieReadFailToast } from '@/lib/cloudStatus';
import { useAppStore } from '@/stores/appStore';

const CANONICAL_SHOPS = ['拾玉居和田玉', '和田雅玉', '祥钰珠宝', 'XY祥钰珠宝'];

function CookieSyncGuide({ onOpenRelay }: { onOpenRelay: () => void }) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <div className="flex items-center gap-2 font-medium">
          <BookOpen className="h-4 w-4" /> Cookie 是怎么同步的？
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Cookie 不是在本地总控里手动填写的。</li>
          <li>千帆中转机器人会从千帆客服台自动采集 Cookie。</li>
          <li>采集成功后上传到云端总控。</li>
          <li>主播分析等系统再从云端总控读取 Cookie。</li>
          <li>本地总控这里只负责查看状态。</li>
        </ol>
        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs text-foreground/80">
          千帆客服台 → 千帆中转机器人 → 云端总控 → 主播分析/其他系统
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onOpenRelay}>
            打开千帆中转机器人
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CookiesPage() {
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const setPage = useAppStore((s) => s.setPage);
  const projects = useAppStore((s) => s.projects);
  const pushToast = useAppStore((s) => s.pushToast);
  const [shops, setShops] = useState<any[]>([]);
  const [archived, setArchived] = useState<any[]>([]);
  const [showTest, setShowTest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const openRelayProject = () => {
    const relay = projects.find((p) => p.code === 'qianfan-relay' || p.name.includes('千帆中转'));
    if (relay?.localPath) {
      window.zhuboDesktop.shell.openPath(relay.localPath);
    } else {
      pushToast('info', '未找到千帆中转机器人项目，请到「项目」页确认 manifest 已扫描。');
      setPage('projects');
    }
  };

  const refresh = useCallback(async () => {
    if (!cloudConnected) return;
    setLoading(true);
    try {
      const data = await window.zhuboDesktop.cloud.qianfanShops(showTest);
      setShops(data.shops || data);
      setArchived(data.archived || []);
    } catch (e) {
      pushToast('info', cookieReadFailToast());
    } finally {
      setLoading(false);
    }
  }, [cloudConnected, pushToast, showTest]);

  useEffect(() => {
    if (cloudConnected) refresh();
  }, [cloudConnected, refresh]);

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

  if (!cloudConnected) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Cookie 状态</h1>
        <Card>
          <CardContent className="space-y-4 py-8 text-sm">
            <p className="text-muted-foreground">Cookie 状态需要连接云端后查看。</p>
            <p className="text-muted-foreground">这不会影响本地项目启动、Git 上传和终端使用。</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setPage('settings')}>去设置云端连接</Button>
              <Button variant="secondary" onClick={() => setShowGuide((v) => !v)}>
                查看 Cookie 推送说明
              </Button>
            </div>
          </CardContent>
        </Card>
        <CookieSyncGuide onOpenRelay={openRelayProject} />
      </div>
    );
  }

  const foundCount = shops.filter((s) => s.found).length;
  const hasCookieData = foundCount > 0;

  if (!hasCookieData && !loading) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Cookie 状态</h1>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="space-y-4 py-6 text-sm">
            <p className="font-medium text-amber-100">云端已连接，但暂未收到千帆 Cookie。</p>
            <p className="text-muted-foreground">
              Cookie
              不是在这里手动填写的。需要启动千帆中转机器人，并打开千帆客服台，由机器人自动采集并上传。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openRelayProject}>打开千帆中转机器人项目</Button>
              <Button variant="secondary" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> 刷新 Cookie
                状态
              </Button>
              <Button variant="ghost" onClick={() => setShowGuide((v) => !v)}>
                查看推送说明
              </Button>
            </div>
          </CardContent>
        </Card>
        <CookieSyncGuide onOpenRelay={openRelayProject} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cookie 状态</h1>
          <p className="text-sm text-muted-foreground">
            正式四店 · 已同步 {foundCount}/4 店 · 来源：千帆中转机器人
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
          <Button size="sm" variant="secondary" onClick={() => setShowGuide((v) => !v)}>
            推送说明
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

      {showGuide && <CookieSyncGuide onOpenRelay={openRelayProject} />}

      <div className="grid gap-3 lg:grid-cols-2">
        {(shops.length
          ? shops
          : CANONICAL_SHOPS.map((name) => ({ shopName: name, found: false }))
        ).map((s) => {
          const stale = s.stale;
          const variant = !s.found ? 'muted' : stale ? 'warning' : 'success';
          const label = !s.found ? '等待上传' : stale ? '超时' : '正常';
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
                <div>来源：千帆中转机器人</div>
                {s.cookieHash && <div>Hash：{hashPrefix(s.cookieHash)}</div>}
                {s.found && (
                  <div className={stale ? 'text-amber-300' : 'text-foreground'}>
                    {qianfanStaleMessage(s.updatedAt, true)}
                  </div>
                )}
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
