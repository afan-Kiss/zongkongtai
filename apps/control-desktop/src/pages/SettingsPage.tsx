import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAppStore } from '@/stores/appStore';

export function SettingsPage() {
  const [cfg, setCfg] = useState<any>({});
  const pushToast = useAppStore((s) => s.pushToast);

  useEffect(() => {
    window.zhuboDesktop.config.get().then(setCfg);
  }, []);

  const save = async () => {
    await window.zhuboDesktop.config.save(cfg);
    const fresh = await window.zhuboDesktop.config.get();
    setCfg(fresh);
    pushToast('success', '配置已保存');
  };

  const toggleAutoStart = async () => {
    const next = !cfg.autoStart;
    await window.zhuboDesktop.config.setAutoStart(next);
    setCfg({ ...cfg, autoStart: next });
    pushToast('success', next ? '已开启开机自启' : '已关闭开机自启');
  };

  return (
    <div className="max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">设置</h1>

      {!cfg.configComplete && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4 text-sm">
            <p className="font-medium text-amber-200">首次使用请先完成配置</p>
            <p className="mt-1 text-muted-foreground">
              {cfg.hasCredentialsSource
                ? '检测到 deploy-output-credentials.txt，首次启动应已自动导入。如仍无法连接，请手动填写下方账号密码并保存。'
                : '未找到 deploy-output-credentials.txt。请填写总控地址、管理员账号和密码。'}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="font-medium">云端连接</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">总控地址</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              value={cfg.controlServerUrl || ''}
              onChange={(e) => setCfg({ ...cfg, controlServerUrl: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">管理员账号</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              value={cfg.adminUsername || ''}
              onChange={(e) => setCfg({ ...cfg, adminUsername: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">
              管理员密码 {cfg.hasAdminPassword ? '(已配置)' : '(未配置)'}
            </span>
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              placeholder="留空则不修改"
              onChange={(e) => setCfg({ ...cfg, adminPassword: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">扫描根目录</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              value={cfg.scanRoot || ''}
              onChange={(e) => setCfg({ ...cfg, scanRoot: e.target.value })}
            />
          </label>
          <div className="text-xs text-muted-foreground">
            Agent Token：{cfg.hasAgentToken ? `已配置 (${cfg.agentToken})` : '未配置'} · Service
            Token：
            {cfg.hasServiceToken ? `已配置 (${cfg.serviceToken})` : '未配置'}
          </div>
          <Button onClick={save}>保存配置</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="font-medium">本地 Agent</div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-100">
            当前 Agent 依赖本机源码树（扫描根目录下的
            总控台/apps/control-agent）。复制绿色包到其他电脑前需要内置
            Agent，否则只能手动在本机有源码的环境运行。
          </p>
          <p className="text-xs text-muted-foreground">
            连接地址：
            <span className="font-mono text-foreground">
              {cfg.controlServerUrl || 'http://8.137.126.18/control'}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Tooltip content="检查配置并重新连接云端">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => window.zhuboDesktop.agent.refresh()}
              >
                检查 Agent
              </Button>
            </Tooltip>
            <Tooltip content="后台启动本地 Agent">
              <Button size="sm" onClick={() => window.zhuboDesktop.agent.start()}>
                启动 Agent
              </Button>
            </Tooltip>
            <Tooltip content="先停止再重新启动">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => window.zhuboDesktop.agent.restart()}
              >
                重启 Agent
              </Button>
            </Tooltip>
            <Tooltip content="打开 Agent 日志目录">
              <Button size="sm" variant="ghost" onClick={() => window.zhuboDesktop.agent.openLog()}>
                打开 Agent 日志
              </Button>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            Agent 日志：%APPDATA%\ZhuboDesktopControl\logs\agent.log
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="font-medium">桌面行为</div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!cfg.autoStart} onChange={toggleAutoStart} />
            开机自动启动总控工作台（不自动启动业务项目）
          </label>
          <div className="text-xs text-muted-foreground break-all">
            配置文件：{cfg.configFilePath || '—'}
          </div>
          <div className="text-xs text-muted-foreground break-all">
            日志目录：{cfg.logDir || '—'}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.zhuboDesktop.config.openConfigDir()}
            >
              打开配置目录
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.zhuboDesktop.config.openLogsDir()}
            >
              打开日志目录
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
