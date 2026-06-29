import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';

import { Badge } from '@/components/ui/Card';

export function AboutPage() {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    window.zhuboDesktop.app.getAbout().then(setInfo);
  }, []);

  if (!info) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">关于</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="font-medium">珠宝本地总控工作台</span>

            <Badge variant="muted">v{info.version}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-2 text-sm">
          <Row label="EXE 路径" value={info.exePath} />

          <Row label="配置路径" value={info.configPath} />

          <Row label="日志路径" value={info.logDir} />

          <Row label="云端地址" value={info.controlServerUrl} />

          <Row
            label="Native Helper"

            value={
              info.nativeHelper?.exists ? `正常 (${info.nativeHelper.path})` : '未找到，请重新打包'
            }
          />

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.zhuboDesktop.config.openLogsDir()}
            >
              打开日志目录
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.zhuboDesktop.config.openConfigDir()}
            >
              打开配置目录
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>

      <div className="break-all font-mono text-xs">{value || '—'}</div>
    </div>
  );
}
