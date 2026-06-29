import { AlertCircle } from 'lucide-react';

import { useAppStore } from '@/stores/appStore';

export function CloudOfflineBanner() {
  const cloudConnected = useAppStore((s) => s.cloudConnected);

  const cloudMessage = useAppStore((s) => s.cloudMessage);

  const setPage = useAppStore((s) => s.setPage);

  if (cloudConnected) return null;

  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
      <AlertCircle className="h-4 w-4 shrink-0" />

      <span className="flex-1">云端未连接：{cloudMessage || '请检查网络与设置'}</span>

      <button className="underline hover:text-white" onClick={() => setPage('settings')}>
        打开设置
      </button>
    </div>
  );
}
