import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('glass rounded-lg shadow-card', className)}>{children}</div>;
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('p-4 pb-2', className)}>{children}</div>;
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('p-4 pt-2', className)}>{children}</div>;
}

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'muted';
  className?: string;
}) {
  const styles = {
    default: 'bg-primary/20 text-primary border-primary/30',
    success: 'bg-success/15 text-green-400 border-success/30',
    warning: 'bg-warning/15 text-amber-400 border-warning/30',
    destructive: 'bg-destructive/15 text-red-400 border-destructive/30',
    muted: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === 'running'
      ? 'bg-green-400 animate-breathe shadow-[0_0_8px_rgba(74,222,128,0.6)]'
      : status === 'external-running'
        ? 'bg-cyan-400 animate-breathe shadow-[0_0_8px_rgba(34,211,238,0.55)]'
        : status === 'starting'
          ? 'bg-amber-400 animate-pulse'
          : status === 'error'
            ? 'bg-red-400 animate-pulse-error shadow-[0_0_8px_rgba(248,113,113,0.5)]'
            : 'bg-muted-foreground/40';
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', color)} />;
}
