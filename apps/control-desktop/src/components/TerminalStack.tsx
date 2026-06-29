import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessSession } from '@/types/desktop';

export function TerminalStack({
  sessions,
  activeId,
  onSelect,
}: {
  sessions: ProcessSession[];
  activeId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  const terminals = sessions.filter((s) => s.type === 'terminal');
  if (terminals.length <= 1) return null;

  return (
    <div className="relative mb-2 h-16">
      {terminals.map((s, i) => {
        const active = s.sessionId === activeId;
        return (
          <motion.button
            key={s.sessionId}
            type="button"
            onClick={() => onSelect(s.sessionId)}
            style={{ zIndex: active ? 30 : 10 + i }}
            className={cn(
              'absolute left-0 top-0 flex h-12 w-48 items-center gap-2 rounded-md border px-2 text-left text-xs shadow-card transition-shadow',
              active
                ? 'border-primary/40 bg-card ring-1 ring-primary/30'
                : 'border-border/60 bg-card/80 hover:border-primary/20',
            )}
            initial={false}
            animate={{
              x: i * 14,
              y: i * 6,
              rotate: i * -1.5,
              scale: active ? 1.02 : 1,
            }}
            whileHover={{ y: i * 6 - 2 }}
          >
            <Terminal className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="truncate font-medium">{s.title}</div>
              <div className="truncate text-[10px] text-muted-foreground">{s.status}</div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
