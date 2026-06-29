import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import { Layout } from './components/Layout';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import ProjectsPage from './pages/Projects';
import ProjectDetailPage from './pages/ProjectDetail';
import PortsPage from './pages/Ports';
import SecretsPage from './pages/Secrets';
import CommandsPage from './pages/Commands';
import AgentsPage from './pages/Agents';
import HealthPage from './pages/Health';
import OperationsPage from './pages/Operations';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    api.me().then(() => setOk(true)).catch(() => setOk(false));
  }, [location.pathname]);

  if (ok === null) return <div style={{ padding: 40 }}>加载中...</div>;
  if (!ok) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="ports" element={<PortsPage />} />
        <Route path="secrets" element={<SecretsPage />} />
        <Route path="commands" element={<CommandsPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="operations" element={<OperationsPage />} />
      </Route>
    </Routes>
  );
}
