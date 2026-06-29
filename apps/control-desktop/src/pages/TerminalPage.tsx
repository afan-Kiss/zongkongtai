import { TerminalPanel } from '@/components/TerminalPanel';

export function TerminalPage() {
  return (
    <div className="flex h-full flex-col p-4">
      <h1 className="mb-4 text-2xl font-semibold">终端</h1>
      <div className="min-h-0 flex-1 rounded-lg border border-border">
        <TerminalPanel />
      </div>
    </div>
  );
}
