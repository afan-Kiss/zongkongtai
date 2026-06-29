import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

const ICON = {
  pending: Circle,
  running: Loader2,
  success: CheckCircle2,
  error: XCircle,
  skipped: Circle,
};

export function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const pushToast = useAppStore((s) => s.pushToast);

  useEffect(() => {
    window.zhuboDesktop.workspace.list().then(setWorkspaces);
    return window.zhuboDesktop.workspace.onStep((step) => {
      setSteps((s) => {
        const idx = s.findIndex((x) => x.id === (step as any).id);
        if (idx >= 0) {
          const next = [...s];
          next[idx] = step;
          return next;
        }
        return [...s, step];
      });
    });
  }, []);

  const run = async (id: string) => {
    setRunning(id);
    setSteps([]);
    try {
      const res = await window.zhuboDesktop.workspace.run(id);
      setSteps(res.steps || []);
      pushToast('success', '工作区流程完成');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">工作区</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {workspaces.map((ws) => (
          <Card key={ws.id}>
            <CardHeader>
              <div className="font-medium">{ws.name}</div>
              <div className="text-xs text-muted-foreground">{ws.description}</div>
            </CardHeader>
            <CardContent>
              <Button onClick={() => run(ws.id)} disabled={!!running}>
                {running === ws.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                一键启动
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {steps.length > 0 && (
        <Card>
          <CardHeader>
            <div className="font-medium">启动流程</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((step, i) => {
              const Icon = ICON[step.status as keyof typeof ICON] || Circle;
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 text-sm"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 ${step.status === 'running' ? 'animate-spin text-primary' : step.status === 'success' ? 'text-green-400' : step.status === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}
                  />
                  <div>
                    <div>{step.label}</div>
                    {step.message && <div className="text-xs text-muted-foreground">{step.message}</div>}
                  </div>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
