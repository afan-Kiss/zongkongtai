import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, Badge } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

export function WebPage() {
  const projects = useAppStore((s) => s.projects);
  const pushToast = useAppStore((s) => s.pushToast);

  const urls = projects
    .map((p) => {
        const url =
          p.healthUrl?.replace(/\/api\/health\/?$/, '') ||
          (p.ports?.[0] ? `http://127.0.0.1:${p.ports[0].port}` : null);
      return url ? { name: p.name, url, id: p.id } : null;
    })
    .filter(Boolean) as { name: string; url: string; id?: string }[];

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Web 页面</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {urls.map((u) => (
          <Card key={u.url}>
            <CardHeader>
              <div className="font-medium">{u.name}</div>
              <div className="truncate text-xs text-muted-foreground">{u.url}</div>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                size="sm"
                onClick={() => window.zhuboDesktop.webview.open(u.id || u.name, u.url)}
              >
                内嵌打开
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => window.zhuboDesktop.shell.openExternal(u.url)}
              >
                <ExternalLink className="h-3 w-3" /> 浏览器
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(u.url);
                  pushToast('success', '链接已复制');
                }}
              >
                复制
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
