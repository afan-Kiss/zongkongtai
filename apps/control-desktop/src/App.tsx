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
import { AboutPage } from '@/pages/AboutPage';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { CloudOfflineBanner } from '@/components/CloudOfflineBanner';

const PAGES = {
  overview: OverviewPage,
  workspace: WorkspacePage,
  projects: ProjectsPage,
  terminal: TerminalPage,
  web: WebPage,
  ports: PortsPage,
  cookies: CookiesPage,
  windows: WindowsPage,
  settings: SettingsPage,
  about: AboutPage,
};

export default function App() {
  const page = useAppStore((s) => s.page);
  const terminalFullscreen = useAppStore((s) => s.terminalFullscreen);
  useCloudBootstrap();

  const Page = PAGES[page];

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
