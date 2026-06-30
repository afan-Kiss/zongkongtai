import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, TopBar, ToastStack } from '@/components/layout/Shell';
import { RightPanel } from '@/components/ProjectCard';
import { TerminalPanel } from '@/components/TerminalPanel';
import { useAppStore } from '@/stores/appStore';
import { useCloudBootstrap } from '@/hooks/useCloudBootstrap';
import { OverviewPage } from '@/pages/OverviewPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { TerminalPage } from '@/pages/TerminalPage';
import { WebPage } from '@/pages/WebPage';
import { PortsPage } from '@/pages/PortsPage';
import { CookiesPage } from '@/pages/CookiesPage';
import { WindowsPage } from '@/pages/WindowsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { GitPage } from '@/pages/GitPage';
import { HealthPage } from '@/pages/HealthPage';
import { BackupPage } from '@/pages/BackupPage';
import { DeployPage } from '@/pages/DeployPage';
import { TasksPage } from '@/pages/TasksPage';
import { AboutPage } from '@/pages/AboutPage';
import { GlobalTaskBar } from '@/components/GlobalTaskBar';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { CloudOfflineBanner } from '@/components/CloudOfflineBanner';
import type { NavPage } from '@/types/desktop';

const PAGES: Record<NavPage, React.ComponentType> = {
  overview: OverviewPage,
  workspace: WorkspacePage,
  projects: ProjectsPage,
  git: GitPage,
  health: HealthPage,
  backup: BackupPage,
  deploy: DeployPage,
  tasks: TasksPage,
  terminal: TerminalPage,
  web: WebPage,
  ports: PortsPage,
  cookies: CookiesPage,
  windows: WindowsPage,
  settings: SettingsPage,
  about: AboutPage,
};

function resolvePage(page: NavPage): React.ComponentType {
  const Page = PAGES[page];
  if (!Page) {
    console.warn('[App] 未注册页面，回退到 overview:', page);
    return OverviewPage;
  }
  return Page;
}

export default function App() {
  const page = useAppStore((s) => s.page);
  const terminalFullscreen = useAppStore((s) => s.terminalFullscreen);
  useCloudBootstrap();

  const Page = resolvePage(page);

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
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <GlobalTaskBar />
            <CloudOfflineBanner />
            <div className="flex min-h-0 flex-1">
              <main className="min-w-0 flex-1 overflow-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={page}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <Page />
                  </motion.div>
                </AnimatePresence>
              </main>
              {page !== 'terminal' && page !== 'settings' && page !== 'projects' && <RightPanel />}
            </div>
            {page !== 'terminal' && <TerminalPanel />}
          </div>
        </div>
        <ToastStack />
      </div>
    </TooltipProvider>
  );
}
