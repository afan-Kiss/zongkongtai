import React from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: React.ReactNode;
  title?: string;
  onGoOverview?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <div>
            <h2 className="text-lg font-semibold">{this.props.title || '页面暂时出错了'}</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {this.state.error.message || '未知错误，请返回总览或刷新页面。'}
            </p>
          </div>
          <div className="flex gap-2">
            {this.props.onGoOverview && (
              <Button variant="secondary" onClick={this.props.onGoOverview}>
                <Home className="h-4 w-4" /> 返回总览
              </Button>
            )}
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" /> 刷新页面
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PageErrorBoundary({
  children,
  pageName,
  onGoOverview,
}: {
  children: React.ReactNode;
  pageName: string;
  onGoOverview: () => void;
}) {
  return (
    <ErrorBoundary title={`${pageName}加载失败`} onGoOverview={onGoOverview}>
      {children}
    </ErrorBoundary>
  );
}
