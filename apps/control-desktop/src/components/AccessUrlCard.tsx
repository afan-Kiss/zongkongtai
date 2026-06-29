import { motion } from 'framer-motion';
import {
  Copy,
  ExternalLink,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Project } from '@/types/desktop';

type UrlRow = {
  label: string;
  url: string | null | undefined;
  kind: 'local' | 'health' | 'cloud' | 'api';
};

function truncateUrl(url: string, max = 42) {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 3)}…`;
}

export function AccessUrlCard({
  project,
  webUrl,
  visible,
  onCopy,
  onOpen,
  onExternal,
}: {
  project: Project;
  webUrl: string | null;
  visible?: boolean;
  onCopy: (url: string) => void;
  onOpen: (url: string) => void;
  onExternal: (url: string) => void;
}) {
  const rows: UrlRow[] = [
    { label: '本地页面', url: project.localWebUrl || webUrl, kind: 'local' },
    {
      label: '健康检查',
      url: project.localHealthUrl || project.healthUrl,
      kind: 'health',
    },
    { label: '云端地址', url: (project as any).publicUrl, kind: 'cloud' },
    { label: 'API 地址', url: (project as any).internalUrl, kind: 'api' },
  ].filter((r) => r.url && !/xiangyuzhubao\.xyz/i.test(String(r.url)));

  const ports = project.ports?.map((p) => p.port).filter(Boolean) || [];
  const hasAny = rows.length > 0;

  if (!visible && !hasAny) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-primary/20 bg-primary/5 p-3"
    >
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-foreground">
        <span className="flex items-center gap-1">
          <Globe className="h-3.5 w-3.5" /> 访问地址
        </span>
        {ports.length > 0 && (
          <span className="text-muted-foreground">端口 {ports.slice(0, 4).join(', ')}</span>
        )}
      </div>

      {!hasAny ? (
        <p className="text-xs text-muted-foreground">
          还没有配置访问地址，请在云端项目配置 localWebUrl。
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <UrlLine
              key={row.label}
              row={row}
              onCopy={onCopy}
              onOpen={onOpen}
              onExternal={onExternal}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function UrlLine({
  row,
  onCopy,
  onOpen,
  onExternal,
}: {
  row: UrlRow;
  onCopy: (u: string) => void;
  onOpen: (u: string) => void;
  onExternal: (u: string) => void;
}) {
  const url = row.url!;
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="w-14 shrink-0 text-muted-foreground">{row.label}</span>
      <Tooltip content={url}>
        <span className="min-w-0 flex-1 truncate font-mono text-foreground/90">
          {truncateUrl(url)}
        </span>
      </Tooltip>
      <Tooltip content="复制地址">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onCopy(url)}>
          <Copy className="h-3 w-3" />
        </Button>
      </Tooltip>
      <Tooltip content="在总控里打开项目页面">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onOpen(url)}>
          <ExternalLink className="h-3 w-3" />
        </Button>
      </Tooltip>
      <Tooltip content="用系统浏览器打开">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onExternal(url)}>
          <Globe className="h-3 w-3" />
        </Button>
      </Tooltip>
    </div>
  );
}

export function UrlCheckBadge({ state }: { state: 'idle' | 'checking' | 'ok' | 'fail' | 'none' }) {
  if (state === 'none') return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  if (state === 'checking') return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />;
  if (state === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  if (state === 'fail') return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  return null;
}
