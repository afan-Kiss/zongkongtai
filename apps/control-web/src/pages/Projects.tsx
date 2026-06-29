import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/Layout';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setProjects(await api.projects(showArchived));
  }

  useEffect(() => { load(); }, [showArchived]);

  async function action(id: string, fn: (id: string) => Promise<unknown>, label: string) {
    try {
      await fn(id);
      setMsg(`${label} 成功`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '操作失败');
    }
  }

  return (
    <div>
      <h2>项目管理</h2>
      {msg && <div className="card">{msg}</div>}
      <div className="toolbar">
        <label><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> 显示归档项目</label>
        <button className="btn btn-primary" onClick={() => {
          const name = prompt('项目名称');
          const code = prompt('项目编码（英文）');
          if (name && code) api.createProject({ name, code }).then(load);
        }}>新增项目</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>项目名</th><th>分类</th><th>位置</th><th>端口</th><th>状态</th>
              <th>健康</th><th>启动命令</th><th>最后扫描</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} style={p.archived ? { opacity: 0.55 } : undefined}>
                <td>
                  <Link to={`/projects/${p.id}`}>{p.name}</Link>
                  {p.archived && <span className="badge badge-gray" style={{ marginLeft: 6 }}>已归档</span>}
                </td>
                <td>{p.category || '-'}</td>
                <td>{p.locationType}</td>
                <td>{[...new Set((p.ports || []).map((x: any) => x.port))].slice(0, 8).join(', ') || '-'}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>{p.healthResults?.[0]?.ok ? '✓' : '-'}</td>
                <td className="mono">{p.startCommand?.slice(0, 30) || '-'}</td>
                <td>{p.lastScannedAt ? new Date(p.lastScannedAt).toLocaleString() : '-'}</td>
                <td>
                  {!p.archived && (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => action(p.id, api.startProject, '启动')}>启动</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => action(p.id, api.stopProject, '停止')}>停止</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => action(p.id, api.restartProject, '重启')}>重启</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => action(p.id, api.healthCheck, '检查')}>检查</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
