import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

export function CloudGate({ children, title }: { children: ReactNode; title: string }) {
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const cloudMessage = useAppStore((s) => s.cloudMessage);
  const setPage = useAppStore((s) => s.setPage);

  if (!cloudConnected) {
    return (
      <div className="p-6">
        <Card className="max-w-lg border-amber-500/30">
          <CardContent className="space-y-3 py-6 text-sm">
            <h2 className="text-lg font-medium">{title}</h2>
            <p className="text-muted-foreground">
              高级工具需要登录云端后使用。{cloudMessage || '请先在设置中配置总控地址和账号。'}
            </p>
            <Button size="sm" onClick={() => setPage('settings')}>
              去设置
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
