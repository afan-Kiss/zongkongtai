import { AlertCircle } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

export function CloudOfflineBanner() {
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const setPage = useAppStore((s) => s.setPage);

  if (cloudConnected) return null;

  return (
    <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-100/90">
      <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
      <span className="flex-1">
        云端未连接，不影响本地功能。如需 Cookie 同步，可在设置页连接云端。
      </span>
      <button className="underline hover:text-white" onClick={() => setPage('settings')}>
        去设置
      </button>
    </div>
  );
}
