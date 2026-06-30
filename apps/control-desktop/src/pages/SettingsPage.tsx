import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

export function SettingsPage() {
  const [cfg, setCfg] = useState<any>({});
  const [testingRelay, setTestingRelay] = useState(false);
  const [relayStatus, setRelayStatus] = useState('');
  const pushToast = useAppStore((s) => s.pushToast);
  const projects = useAppStore((s) => s.projects);
  const setPage = useAppStore((s) => s.setPage);

  useEffect(() => {
    window.zhuboDesktop.config.get().then(setCfg);
  }, []);

  const save = async () => {
    await window.zhuboDesktop.config.save(cfg);
    const fresh = await window.zhuboDesktop.config.get();
    setCfg(fresh);
    pushToast('success', '设置已保存到本机。');
  };

  const toggleAutoStart = async () => {
    const next = !cfg.autoStart;
    await window.zhuboDesktop.config.setAutoStart(next);
    setCfg({ ...cfg, autoStart: next });
    pushToast('success', next ? '已开启开机自启' : '已关闭开机自启');
  };

  const testRelay = async () => {
    setTestingRelay(true);
    try {
      const r = await window.zhuboDesktop.cookie.testRelay(cfg.qianfanRelayUrl);
      setRelayStatus(r.message);
      pushToast(r.ok ? 'success' : 'info', r.message);
    } finally {
      setTestingRelay(false);
    }
  };

  const openRelayProject = () => {
    const relay = projects.find((p) => p.code === 'qianfan-relay' || p.name.includes('千帆中转'));
    if (relay?.localPath) {
      window.zhuboDesktop.shell.openPath(relay.localPath);
    } else {
      pushToast('info', '未找到千帆中转机器人项目');
    }
  };

  const resetCache = async () => {
    const r = await window.zhuboDesktop.config.resetLocalCache();
    pushToast(r.ok ? 'success' : 'info', r.message);
    const local = await window.zhuboDesktop.projects.loadLocal();
    if (local?.length) useAppStore.getState().setProjects(local as any);
  };

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">设置</h1>
      <p className="text-sm text-muted-foreground">本地项目、Git、端口、Cookie、终端管理</p>

      <Card>
        <CardHeader>
          <div className="font-medium">本地扫描</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">扫描根目录</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              value={cfg.scanRoot || ''}
              onChange={(e) => setCfg({ ...cfg, scanRoot: e.target.value })}
            />
          </label>
          <Button onClick={save}>保存到本机</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="font-medium">Cookie 同步配置</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">千帆中转机器人地址</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm"
              value={cfg.qianfanRelayUrl || 'http://127.0.0.1:9323'}
              onChange={(e) => setCfg({ ...cfg, qianfanRelayUrl: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">本地 Cookie API 端口</span>
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm"
              value={cfg.localControlApiPort || 4793}
              onChange={(e) =>
                setCfg({ ...cfg, localControlApiPort: Number(e.target.value) || 4793 })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {relayStatus || '其他本地项目可通过本地 Cookie API 读取 Cookie。'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={testRelay} disabled={testingRelay}>
              {testingRelay ? '测试中…' : '测试千帆连接'}
            </Button>
            <Button size="sm" variant="ghost" onClick={openRelayProject}>
              打开千帆中转机器人项目
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="font-medium">本地数据</div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="text-xs text-muted-foreground break-all">
            配置目录：{cfg.configDir || '—'}
          </div>
          <div className="text-xs text-muted-foreground break-all">
            日志目录：{cfg.logDir || '—'}
          </div>
          <div className="text-xs text-muted-foreground break-all">
            Cookie 存储：{cfg.cookieStorePath || '—'}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.zhuboDesktop.config.openConfigDir()}
            >
              打开本地数据目录
            </Button>
            <Button size="sm" variant="ghost" onClick={resetCache}>
              重置本地缓存
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <button
            type="button"
            className="text-left font-medium"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            高级工具 {showAdvanced ? '▾' : '▸'}
          </button>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {(
              [
                ['ports', '端口'],
                ['about', '关于'],
              ] as const
            ).map(([page, label]) => (
              <Button key={page} size="sm" variant="secondary" onClick={() => setPage(page)}>
                {label}
              </Button>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="font-medium">桌面行为</div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!cfg.autoStart} onChange={toggleAutoStart} />
            开机自动启动总控工作台
          </label>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.zhuboDesktop.config.openLogsDir()}
          >
            打开日志目录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
