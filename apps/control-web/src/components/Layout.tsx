import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Layout() {
  const navigate = useNavigate();

  async function logout() {
    await api.logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>珠宝项目总控台</h1>
        <nav>
          <NavLink to="/" end>
            首页仪表盘
          </NavLink>
          <NavLink to="/projects">项目管理</NavLink>
          <NavLink to="/ports">端口管理</NavLink>
          <NavLink to="/secrets">Cookie 管理</NavLink>
          <NavLink to="/commands">启动命令</NavLink>
          <NavLink to="/agents">Agent 状态</NavLink>
          <NavLink to="/health">健康检查</NavLink>
          <NavLink to="/operations">操作记录</NavLink>
        </nav>
        <div style={{ padding: '20px' }}>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'badge-green',
    stopped: 'badge-gray',
    error: 'badge-red',
    unknown: 'badge-yellow',
    valid: 'badge-green',
    expired: 'badge-red',
    invalid: 'badge-red',
    online: 'badge-green',
    offline: 'badge-gray',
    conflict: 'badge-red',
    warning: 'badge-yellow',
    none: 'badge-gray',
  };
  const label: Record<string, string> = {
    running: '运行中',
    stopped: '已停止',
    error: '异常',
    unknown: '未知',
    valid: '有效',
    expired: '已过期',
    invalid: '无效',
    online: '在线',
    offline: '离线',
    conflict: '冲突',
    warning: '提醒',
    none: '正常',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{label[status] || status}</span>;
}

const ROLE_LABEL: Record<string, string> = {
  listener: '服务监听',
  client_reference: '调用别的服务',
  proxy: '代理',
  unknown: '未识别',
};

export function RoleBadge({ role }: { role?: string }) {
  const r = role || 'unknown';
  return <span className="badge badge-gray">{ROLE_LABEL[r] || r}</span>;
}

export function formatOperation(log: {
  action: string;
  detailJson?: string | null;
  actor: string;
}) {
  if (log.action === 'scan_upload' && log.detailJson) {
    try {
      const d = JSON.parse(log.detailJson);
      if (d.message) return d.message;
    } catch {
      /* ignore */
    }
  }
  const actionLabel: Record<string, string> = {
    login: '登录',
    logout: '退出',
    scan_upload: '上传扫描结果',
    create_project: '新建项目',
    update_project: '更新项目',
    delete_project: '删除项目',
  };
  return `${log.actor} ${actionLabel[log.action] || log.action}`;
}
