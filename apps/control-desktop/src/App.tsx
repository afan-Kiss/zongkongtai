import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, TopBar, ToastStack } from '@/components/layout/Shell';
import { RightPanel } from '@/components/ProjectCard';
import { TerminalPanel } from '@/components/TerminalPanel';
import { ErrorBoundary, PageErrorBoundary } from '@/components/ErrorBoundary';
import { useAppStore } from '@/stores/appStore';
import { useLocalBootstrap } from '@/hooks/useLocalBootstrap';
import { OverviewPage } from '@/pages/OverviewPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { TerminalPage } from '@/pages/TerminalPage';
import { WebPage } from '@/pages/WebPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { GitPage } from '@/pages/GitPage';
import { HealthPage } from '@/pages/HealthPage';
import { AboutPage } from '@/pages/AboutPage';
import { GlobalTaskBar } from '@/components/GlobalTaskBar';
import { PortConflictDialog } from '@/components/PortConflictDialog';
import { TooltipProvider } from '@/components/ui/Tooltip';
import type { NavPage } from '@/types/desktop';

const LEGACY_FALLBACK: NavPage[] = [
  'workspace',
  'backup',
  'deploy',
  'tasks',
  'ports',
  'cookies',
  'windows',
];

const PAGES: Record<NavPage, React.ComponentType> = {
  overview: OverviewPage,
  workspace: OverviewPage,
  projects: ProjectsPage,
  git: GitPage,
  health: HealthPage,
  backup: OverviewPage,
  deploy: OverviewPage,
  tasks: OverviewPage,
  terminal: TerminalPage,
  web: WebPage,
  ports: OverviewPage,
  cookies: OverviewPage,
  windows: OverviewPage,
  settings: SettingsPage,
  about: AboutPage,
};

const PAGE_LABELS: Partial<Record<NavPage, string>> = {
  overview: '总览',
  projects: '项目',
  git: 'Git 上传',
  health: '简单体检',
  backup: '备份回滚',
  deploy: '部署记录',
  tasks: '后台任务',
  terminal: '终端',
  web: 'Web 页面',
  ports: '端口',
  settings: '设置',
  about: '关于',
};

function resolvePage(page: NavPage): React.ComponentType {
  if (LEGACY_FALLBACK.includes(page)) {
    console.warn('[App] 旧路由已移除，回退到 overview:', page);
    return OverviewPage;
  }
  const Page = PAGES[page];
  if (!Page) {
    console.warn('[App] 未注册页面，回退到 overview:', page);
    return OverviewPage;
  }
  return Page;
}

function RoutedPage({ page }: { page: NavPage }) {
  const setPage = useAppStore((s) => s.setPage);
  const Page = resolvePage(page);
  const label = PAGE_LABELS[page] || page;

  return (
    <PageErrorBoundary pageName={label} onGoOverview={() => setPage('overview')}>
      <Page />
    </PageErrorBoundary>
  );
}

export default function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const terminalFullscreen = useAppStore((s) => s.terminalFullscreen);
  useLocalBootstrap();

  if (terminalFullscreen) {
    return (
      <>
        <TerminalPanel />
        <ToastStack />
      </>
    );
  }

  return (
    <TooltipProvider>
      <ErrorBoundary title="总控工作台暂时无法显示" onGoOverview={() => setPage('overview')}>
        <div className="flex h-screen flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <GlobalTaskBar />
              <div className="flex min-h-0 flex-1">
                <main className="min-w-0 flex-1 overflow-auto">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={page}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="h-full"
                    >
                      <RoutedPage page={page} />
                    </motion.div>
                  </AnimatePresence>
                </main>
                {page !== 'terminal' &&
                  page !== 'settings' &&
                  page !== 'projects' &&
                  page !== 'git' && <RightPanel />}
              </div>
              {page !== 'terminal' && <TerminalPanel />}
            </div>
          </div>
          <ToastStack />
          <PortConflictDialog />
        </div>
      </ErrorBoundary>
    </TooltipProvider>
  );
}
